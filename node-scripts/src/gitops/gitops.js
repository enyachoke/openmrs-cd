const simpleGit = require("simple-git");
const fs = require("fs");
const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const path = require("path");

const util = require("util");
const cst = require("../const");
const db = require(cst.DBPATH);
const config = require(cst.CONFIGPATH);
const axios = require("axios");


const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

const git = simpleGit();

async function validateInstanceSchema(instanceContent) {
  try {
    // Load the instance schema
    const schemaPath = path.join(
      __dirname,
      "..",
      "schemas",
      "instance.schema.json"
    );
    const schemaContent = await readFile(schemaPath, "utf8");
    const schema = JSON.parse(schemaContent);

    // Initialize Ajv and add formats
    const ajv = new Ajv();
    addFormats(ajv);

    // Validate against schema
    const validate = ajv.compile(schema);
    const valid = validate(instanceContent);

    if (!valid) {
      return {
        valid: false,
        errors: validate.errors
      };
    }

    return {
      valid: true
    };
  } catch (error) {
    console.error("Error validating schema:", error);
    return {
      valid: false,
      error: error.message
    };
  }
}

async function processInstanceFile(fileContent, filePath) {
  try {
    // Parse to verify it's valid JSON
    const instanceDefinition = JSON.parse(fileContent);

    // Validate against schema
    const validation = await validateInstanceSchema(instanceDefinition);
    if (!validation.valid) {
      throw new Error(
        `Schema validation failed: ${JSON.stringify(
          validation.errors || validation.error
        )}`
      );
    }

    // Save the instance definition
    await db.saveInstanceDefinition(instanceDefinition);
    console.log(`Saved instance definition from ${filePath}`);

    // Check if active field exists and is false
    if ('active' in instanceDefinition && instanceDefinition.active === false) {
      console.log(`Instance ${instanceDefinition.uuid} marked as inactive, triggering destroy-instance job`);
      
      try {
        
        const response = await axios({
          method: 'POST',
          url: 'http://localhost:8080/job/destroy-instance/buildWithParameters',
          params: {
            instanceUuid: instanceDefinition.uuid,
            recreate: false
          },
          auth: {
            username: 'admin',
            password: process.env.JENKINS_API_TOKEN
          }
        });

        return {
          path: filePath,
          processed: true,
          instanceUuid: instanceDefinition.uuid,
          destroyJobTriggered: true,
          destroyJobUrl: response.headers.location,
          recreate: false
        };
      } catch (error) {
        console.error(`Error triggering destroy-instance job: ${error.message}`);
        if (error.response) {
          console.error('Response status:', error.response.status);
          console.error('Response headers:', error.response.headers);
          console.error('Response data:', error.response.data);
        }
        return {
          path: filePath,
          processed: true,
          instanceUuid: instanceDefinition.uuid,
          destroyJobTriggered: false,
          error: error.message,
          responseStatus: error.response?.status,
          responseData: error.response?.data
        };
      }
    }

    // Only save instance event if not marked for destruction
    await db.saveInstanceEvent(instanceDefinition);
    console.log(`Saved instance event for ${filePath}`);

    return {
      path: filePath,
      processed: true,
      instanceUuid: instanceDefinition.uuid,
      destroyJobTriggered: false
    };
  } catch (error) {
    console.error(`Error processing instance file ${filePath}:`, error);
    return {
      path: filePath,
      processed: false,
      error: error.message
    };
  }
}

async function getChangedFilesContent() {
  try {
    const previousBuildCommit = process.env.GIT_PREVIOUS_SUCCESSFUL_COMMIT;
    const currentCommit = process.env.GIT_COMMIT;

    if (!previousBuildCommit || !currentCommit) {
      console.log("No previous build commit found or current commit not set.");
      console.log("Previous build commit:", previousBuildCommit);
      console.log("Current commit:", currentCommit);
      process.exit(1);
    }

    console.log("Comparing changes between:");
    console.log("Previous build:", previousBuildCommit);
    console.log("Current build:", currentCommit);

    // Get the list of changed files between commits
    const diffSummary = await git.diff([
      previousBuildCommit,
      currentCommit,
      "--name-status"
    ]);

    // Parse the diff output to get changed files
    const changedFiles = diffSummary
      .split("\n")
      .filter(function(line) {
        return line.length > 0;
      })
      .map(function(line) {
        const [status, file] = line.split("\t");
        return {
          status: status.trim(),
          path: file.trim()
        };
      });

    // Filter for instance files in the instances subfolder
    const instanceFiles = changedFiles.filter(
      file => file.path.startsWith("instances/") && file.path.endsWith(".json")
    );

    console.log("\nInstance files changed:", instanceFiles);

    // Process the instance files
    const results = await Promise.all(
      instanceFiles.map(async function(file) {
        try {
          // Skip deleted files
          if (file.status === "D") {
            return {
              path: file.path,
              status: "deleted",
              processed: false
            };
          }

          // Read the file content
          const content = await readFile(file.path, "utf8");
          return await processInstanceFile(content, file.path);
        } catch (error) {
          console.error("Error processing file " + file.path + ":", error);
          return {
            path: file.path,
            status: file.status,
            processed: false,
            error: error.message
          };
        }
      })
    );

    // Output the results
    console.log("\nProcessing Results:");
    results.forEach(function(result) {
      console.log(`\n=== ${result.path} ===`);
      if (result.processed) {
        console.log("Successfully processed instance definition and event");
        console.log("Instance UUID:", result.instanceUuid);
      } else if (result.status === "deleted") {
        console.log("File was deleted");
      } else if (result.error) {
        console.log("Error:", result.error);
      } else {
        console.log("Not processed:", result.reason || "Unknown reason");
      }
    });

    // Save the report
    await writeFile(
      "instance-processing-report.json",
      JSON.stringify(
        {
          previousBuildCommit: previousBuildCommit,
          currentCommit: currentCommit,
          results: results
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

getChangedFilesContent();
