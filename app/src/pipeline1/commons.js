"use strict";

const path = require("path");
const fs = require("fs");
const log = require("npmlog");
const _ = require("lodash");
const XML = require("pixl-xml");

const model = require("../models/model");

module.exports = {
  /*
   * Objectifies a POM XML file.
   * 
   * @param {string} pomDirPath - The path to the POM file directory.
   */
  getPom: function(pomDirPath) {
    var file = fs.readFileSync(path.resolve(pomDirPath, "pom.xml"), "utf8");
    var parsedPom = XML.parse(file);
    return parsedPom;
  },

  /*
   * Generates the default build script for Maven projects.
   * 
   *  'mvn clean install'
   */
  getMavenProjectBuildScript: function(projectType) {
    var script = new model.Script();

    script.type = "#!/bin/bash";
    script.headComment =
      "# Autogenerated script to build projects of type '" +
      projectType +
      "'...";

    script.body = "mvn clean install\n";

    return script;
  },

  /*
   * Generates the default deploy script for Maven projects.
   *
   * @param {string} projectType - Eg. 'openmrsmodule', 'openmrscore', ... etc.
   * @param {string} uploadUrlEnvvarName - Eg. 'ARTIFACT_UPLOAD_URL_openmrsmodule', 'ARTIFACT_UPLOAD_URL_openmrscore', ... etc.
   * 
   *  'mvn clean deploy'
   */
  getMavenProjectDeployScript: function(projectType, uploadUrlEnvvarName) {
    var script = new model.Script();

    script.type = "#!/bin/bash";
    script.headComment =
      "# Autogenerated script to deploy projects of type '" +
      projectType +
      "'...";

    script.body = "nexus_envvars=$1 ; . $nexus_envvars\n";
    script.body += "mvn clean deploy -DskipTests";
    script.body += " ";
    script.body +=
      "-DaltDeploymentRepository=${NEXUS_REPO_ID}::default::${" +
      uploadUrlEnvvarName +
      "}\n";

    return script;
  },

  /*
   * Generates a default 'Artifact' object for a Maven project.
   *  The ouput encapsulates the 'MavenProject' object.
   *
   * @param {string} pomDirPath - The path to the POM file's directory.
   * @param {string} buildPath - The relative build path. Eg. './target'
   * @param {string} artifactExtension - The extension of the build output artifact file. Eg. 'omod', 'zip', 'jar'... etc.
   * 
   */
  getMavenProjectArtifact: function(pomDirPath, buildPath, artifactExtension) {
    var pom = module.exports.getPom(pomDirPath);

    var artifact = new model.Artifact();
    artifact.name = pom.artifactId;
    artifact.version = pom.version;
    artifact.buildPath = buildPath;
    artifact.extension = artifactExtension;
    artifact.filename =
      artifact.name + "-" + artifact.version + "." + artifact.extension;
    artifact.destFilename = artifact.filename;

    // encapsulating the Maven project
    var mavenProject = new model.MavenProject();
    mavenProject.groupId = pom.groupId;
    mavenProject.artifactId = pom.artifactId;
    mavenProject.version = pom.version;
    mavenProject.packaging = artifactExtension;
    artifact.mavenProject = mavenProject;

    return artifact;
  },

  postBuildActions: function() {}
};