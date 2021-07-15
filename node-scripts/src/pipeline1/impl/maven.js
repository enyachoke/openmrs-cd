"use strict";

const fs = require("fs");
const path = require("path");

const model = require("../../utils/model");
const utils = require("../../utils/utils");

const cmns = require("../commons");

const thisType = "maven";

module.exports = {
  getInstance: function() {
    var projectBuild = new model.ProjectBuild();

    projectBuild.getBuildScript = function() {
      return cmns.getMavenProjectBuildScript(thisType);
    };

    projectBuild.getDeployScript = function(artifact) {
      return cmns.getMavenProjectDeployScript(
        thisType,
        "ARTIFACT_UPLOAD_URL_" + thisType
      );
    };

    projectBuild.getArtifact = function(args) {
      return cmns.getMavenProjectArtifact(args.pom, "", "");
    };

    projectBuild.postBuildActions = function(args) {
      cmns.mavenPostBuildActions(
        args.pom.groupId,
        args.artifactsIds,
        args.pom.version
      );
    };

    return projectBuild;
  }
};
