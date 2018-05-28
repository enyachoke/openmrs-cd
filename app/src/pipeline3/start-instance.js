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

const currentStage = "5";

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
script.body = "set -e\n";

// 'artifacts'

if (process.env[config.varArtifactsChanges()] === "true") {
  if (!(process.env[config.varDeploymentChanges()] === "true")) {
    script.body += scripts.remote(
      ssh,
      scripts.container.restart(instanceDef.uuid)
    );
  }
}

// 'deployment'

if (process.env[config.varDeploymentChanges()] === "true") {
  if (instanceDef.deployment.type === "docker") {
    script.body += scripts.remote(
      ssh,
      scripts.container.remove(instanceDef.uuid)
    );
    script.body += scripts.remote(
      ssh,
      scripts.container.run(instanceDef.uuid, instanceDef)
    );
  }
}

// 'data'

if (process.env[config.varDataChanges()] === "true") {
  instanceDef.data.forEach(function(data) {
    if (data.type === "instance") {
      // A source instance has been provided, we need to move the MySQL file:
      var mySQLDatadir = "/mnt/data/mysql_datadir";
      var moveMySQLFolder = "";
      moveMySQLFolder +=
        "chmod 775 /etc/bahmni-installer/move-mysql-datadir.sh\n";
      moveMySQLFolder +=
        "sh -c '/etc/bahmni-installer/move-mysql-datadir.sh /etc/my.cnf " +
        mySQLDatadir +
        "'\n";
      moveMySQLFolder += "chown -R mysql:mysql " + mySQLDatadir;
      script.body += scripts.remote(
        ssh,
        scripts.container.exec(instanceDef.uuid, moveMySQLFolder)
      );

      script.body += scripts.remote(
        ssh,
        scripts.container.restart(instanceDef.uuid)
      );
    }
    if (
      data.type === "sql" &&
      (data.executionStage === currentStage || _.isEmpty(data.executionStage))
    ) {
      var sql = data.value;
      var randomFolderName = config.getUuid().substring(0, 7);
      var destFolder = "/tmp/" + randomFolderName + "/";
      Object.assign(ssh, { remoteDst: false, remoteSrc: false });
      script.body += scripts.remote(
        ssh,
        scripts.container.copy(instanceDef.uuid, sql.sourceFile, destFolder)
      );

      var sqlCmd = "";
      if (sql.engine == "mysql") {
        var cat = "cat";
        if (path.basename(sql.sourceFile).endsWith(".gz")) {
          cat = "zcat";
        }
        sqlCmd =
          cat +
          " " +
          destFolder +
          path.basename(sql.sourceFile) +
          " | " +
          sql.engine +
          " -uroot -ppassword " +
          sql.database;
      }
      script.body += scripts.remote(
        ssh,
        scripts.container.exec(instanceDef.uuid, sqlCmd)
      );
    }
  });
}

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
