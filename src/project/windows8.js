var path      = require('path'),
    fs        = require('fs'),
    csproj    = require('../util/csproj'),
	project   = require('../project'),
    wp8       = require('../project/wp8');

var win = function(){
    project.cordova.apply(this, arguments);

	var config = wp8.findConfig('*.jsproj', this._root);
	if(!config)
		 throw new Error('Invalid Windows Store JS project (no .jsproj file in "'+ this._root +'")');		

    this._solution = new csproj( path.join(this._root, config) );
};

win.prototype = Object.create(wp8).prototype;

module.exports = win;
