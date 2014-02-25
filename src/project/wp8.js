var path      = require('path'),
    fs        = require('fs'),
    windows   = require('../platforms/wp8'),
    project   = require('../project');

var winProject = function(){
    project.cordova.apply(this, arguments);
    this._solution = windows.parseProjectFile(this._root);
};

winProject.prototype = new project.cordova;
winProject.prototype.saveFile = function(path, data) {
    this._solution.addSourceFile(path);

    return project.cordova.apply(this, arguments);
}

module.exports = winProject;
