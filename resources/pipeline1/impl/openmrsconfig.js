var model = require('../model')
var utils = require('../../utils/utils')
var fs = require('fs')

module.exports = {

  getInstance: function() {

    var project = new model.Project();

    // Implement here the Project object methods
    project.getBuildScriptAsString = function () {
      return getBuildScriptAsString();
    }
    project.getBuildScript = function () {
      return getBuildScript();
    }
    project.getArtifact = function (pomPath) {
      var artifact = new model.Artifact();

      artifact.extension = "zip"
      artifact.path = "./target"

      var pom = utils.getPom(pomPath);
      artifact.version = pom.version
      artifact.name = pom.artifactId
      
      artifact.filename = artifact.name + "-" + artifact.version + "." + artifact.extension

      return artifact
    }

    return project
  } 
}

var getBuildScript = function() {

  var buildScript = new model.BuildScript();

  buildScript.type = "#!/bin/bash"
  buildScript.comments = "# Autogenerated script to build 'openmrsconfig' type of projects"
  buildScript.value = "mvn clean install\n"

  return buildScript    
}

var getBuildScriptAsString = function() {

  var buildScript = getBuildScript()

  var string = ""

  string = buildScript.type
  string = string + "\n\n"
  string = string + buildScript.comments
  string = string + "\n\n"
  string = string + buildScript.value

  return string
}
