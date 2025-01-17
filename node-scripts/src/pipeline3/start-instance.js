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

// Substitute secrets in the instance definiton with Jenkins credentials
instanceDef = utils.substituteSecrets(
  instanceDef,
  utils.mergeObjects(process.env[config.getSecretsEnvVar()])
);

//
//  Host metadata
//
var ssh = instanceDef.deployment.host.value; // TODO this should be extracted based on the host type

//
//  Building the script
//
var script = new model.Script();
script.type = "#!/bin/bash";
script.headComment = "# Autogenerated script for the instance start/restart...";
script.body = [];
script.body.push("set -e\n");

// 'artifacts'

if (process.env[config.varArtifactsChanges()] === "true") {
}

// 'deployment'
var container = require("./impl/" + instanceDef.deployment.type);

if (process.env[config.varDeploymentChanges()] === "true") {
  script.body.push(scripts.remote(ssh, container.down(instanceDef)));
  script.body.push(container.startInstance.getDeploymentScript(instanceDef));
}

// Link mounted folders based on the components to link
if (!_.isEmpty(instanceDef.deployment.links)) {
  script.body.push(container.setLinks(instanceDef));
  // Restart after linking folders
  script.body.push(scripts.remote(ssh, container.restart(instanceDef)));
}

// 'data'
if (process.env[config.varDataChanges()] === "true") {
  script.body.push(container.startInstance.getDataScript(instanceDef));
}

// 'properties'
if (process.env[config.varPropertiesChanges()] === "true") {
  instanceDef.properties.forEach(function(property) {
    const extension = property.filename.split(".").pop();
    var writeFile = {
      properties: function() {
        return utils.convertToProperties(property.properties, ".");
      },
      json: function() {
        return JSON.stringify(property.properties);
      },
      env: function() {
        return this.properties();
      }
    };

    var output = writeFile[extension]();
    script.body.push(container.setProperties(instanceDef, property, output));
  });
}

// Set the Timezone if provided

var computedScript = scripts.computeAdditionalScripts(
  script.body,
  instanceDef,
  currentStage,
  config,
  process.env
);
script.body = computedScript.script;

// Final restart
script.body.push(scripts.remote(ssh, container.restart(instanceDef)));

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
