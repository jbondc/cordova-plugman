var path      = require('path'),
    fs        = require('fs'),
    windows8  = require('../platforms/windows8'),
    wp8       = require('../project/wp8');

var winProject = function(){
    wp8.apply(this, arguments);
    this._solution = windows8.parseProjectFile(this._root);
};

winProject.prototype = new wp8;

module.exports = winProject;
