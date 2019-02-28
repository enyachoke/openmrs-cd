"use strict";

/**
 * Main script of the 'start instance' stage.
 *
 */

const fs = require("fs");
const path = require("path");
const _ = require("lodash");

const utils = require("../utils/utils");
const model = require("../utils/model");
const cst = require("../const");
const config = require(cst.CONFIGPATH);
const db = require(cst.DBPATH);

const scripts = require("./scripts");

const secrets = config.getSecrets();
const currentStage = config.getStartInstanceStatusCode();

//
//  Fetching the instance definition based on the provided UUID
//
var instanceDef = db.getInstanceDefinition(
  process.env[config.varInstanceUuid()]
);
if (_.isEmpty(instanceDef)) {
  throw new Error("Illegal argument: empty or unexisting instance definition.");
}

//
//  Host metadata
//
var ssh = instanceDef.deployment.host.value; // TODO this should be extracted based on the host type
var hostDir = instanceDef.deployment.hostDir;

//
//  Building the script
//
var script = new model.Script();
script.type = "#!/bin/bash";
script.headComment = "# Autogenerated script for the instance start/restart...";
script.body = [];
script.body.push("set -e\n");

var componentsToLink = [];

// 'artifacts'

var finalRestart = false;
if (process.env[config.varArtifactsChanges()] === "true") {
  finalRestart = true;
  componentsToLink.push("artifact");
}

// 'deployment'
var container = scripts[instanceDef.deployment.type];

if (process.env[config.varDeploymentChanges()] === "true") {
  script.body.push(scripts.remote(ssh, container.remove(instanceDef.uuid)));
  var mounts = {
    "/mnt": hostDir
  };

  var setTLS = "";

  if (!_.isEmpty(instanceDef.deployment.tls)) {
    var tls = instanceDef.deployment.tls;
    if (tls.type === "file") {
      mounts[
        scripts.trailSlash(tls.value.keysFolder, false)
      ] = scripts.trailSlash(tls.value.hostKeysFolder, false);
    }
    setTLS += scripts.remote(
      ssh,
      container.exec(
        instanceDef.uuid,
        scripts.logInfo("Configuring TLS certs") +
          tls.value.webServerUpdateScript +
          " " +
          tls.value.webServerConfFile +
          " " +
          scripts.trailSlash(tls.value.keysFolder, true) +
          tls.value.privateKeyFilename +
          " " +
          scripts.trailSlash(tls.value.keysFolder, true) +
          tls.value.publicCertFilename +
          " " +
          scripts.trailSlash(tls.value.keysFolder, true) +
          tls.value.chainCertsFilename
      )
    );
  }
  script.body.push(
    scripts.remote(ssh, container.run(instanceDef.uuid, instanceDef, mounts))
  );
  script.body.push(setTLS);
}

// Link mounted folders based on the components to link
if (!_.isEmpty(instanceDef.deployment.links)) {
  script.body.push(
    scripts.remote(
      ssh,
      container.exec(
        instanceDef.uuid,
        scripts.linkComponents(instanceDef.deployment.links)
      )
    )
  );
  // Restart after linking folders
  script.body.push(scripts.remote(ssh, container.restart(instanceDef.uuid)));
}

// 'data'
if (process.env[config.varDataChanges()] === "true") {
  instanceDef.data.forEach(function(data) {
    componentsToLink.push("data");
    var applyData = {
      instance: function() {
        // Nothing to do when providing an 'instance'
      },
      sql: function() {
        var sql = data.value;
        var randomFolderName = utils
          .random()
          .toString(36)
          .slice(-5);
        var destFolder = "/tmp/" + randomFolderName + "/";
        Object.assign(ssh, { remoteDst: false, remoteSrc: false });
        script.body.push(
          scripts.remote(
            ssh,
            container.exec(instanceDef.uuid, "mkdir -p " + destFolder) +
              "\n" +
              container.copy(instanceDef.uuid, sql.sourceFile, destFolder)
          )
        );

        var sqlCmd = "";
        var waitForMySQL = "";
        var applyEngine = {
          mysql: function() {
            script.body.push(
              scripts.remote(
                ssh,
                container.exec(
                  instanceDef.uuid,
                  scripts.mySqlRestore(
                    destFolder,
                    path.basename(sql.sourceFile),
                    sql
                  )
                )
              )
            );
          },
          bahmni: function() {
            script.body.push(
              scripts.remote(
                ssh,
                container.exec(
                  instanceDef.uuid,
                  scripts.bahmniRestore(
                    destFolder,
                    path.basename(sql.sourceFile),
                    sql
                  )
                )
              )
            );
          }
        };
        applyEngine[sql.engine]();
      }
    };
    applyData[data.type]();
  });
}

// Set the Timezone if provided
if (instanceDef.deployment.timezone) {
  script.body.push(
    scripts.remote(
      ssh,
      container.exec(
        instanceDef.uuid,
        scripts.setTimezone(instanceDef.deployment.timezone)
      )
    )
  );
}

var computedScript = scripts.computeAdditionalScripts(
  script.body,
  instanceDef,
  currentStage,
  config,
  process.env
);
script.body = computedScript.script;

finalRestart += computedScript.restartNeeded;

if (finalRestart) {
  script.body.push(scripts.remote(ssh, container.restart(instanceDef.uuid)));
}

script.body = script.body.join(cst.SCRIPT_SEPARATOR);

//
//  Saving the script in the current build dir.
//
fs.writeFileSync(
  path.resolve(config.getBuildDirPath(), config.getStartInstanceScriptName()),
  utils.getScriptAsString(script)
);
fs.chmodSync(
  path.resolve(config.getBuildDirPath(), config.getStartInstanceScriptName()),
  "0755"
);

// Saving the status
fs.writeFileSync(
  path.resolve(config.getBuildDirPath(), config.getStatusFileName()),
  JSON.stringify({ status: currentStage })
);
