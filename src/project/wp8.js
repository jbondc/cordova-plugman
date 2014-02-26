var path      = require('path'),
    fs        = require('fs'),
	glob      = require('glob'),
    csproj    = require('../util/csproj'),
    project   = require('../project');

var parent = project.cordova.prototype;
var win = function(){
    project.cordova.apply(this, arguments);

	var config = win.findConfig('*.csproj', this._root);
	if(!config)
		 throw new Error('Invalid Windows Phone project (no .csproj file in "'+ this._root +'")');		

    this._solution = new csproj( path.join(this._root, config) );
};

win.findConfig = function(ext, root) {
	var project_files = glob.sync(ext, {
		cwd: root
	});

	return project_files[0] || false;
};

win.prototype = Object.create(project.cordova).prototype;

win.prototype.saveFile = function(path, data) {
    if( parent.saveFile.apply(this, arguments) ) {
		this._solution.addSourceFile(path);
		return true;
	}

	return false;
}

win.prototype.updateRuntime = function() {
	this.checkFiles();

	parent.updateRuntime.call(this, arguments);

   	this._solution.write();
}

win.prototype.checkFiles = function(){
	var paths = this.getPaths();
	var wwwPath = paths['www'];

	var item_groups = this._solution.xml.findall('ItemGroup');
	for (var i = 0, l = item_groups.length; i < l; i++) {
		var group = item_groups[i];
		var files = group.findall('Content'),
		    file, fpath;

		for (var j = 0, k = files.length; j < k; j++) {
			file = files[j];
			fpath = path.normalize(file.attrib.Include);

			if (fpath.substr(0,11) == path.join(wwwPath, "plugins") || fpath == path.join(wwwPath, "cordova_plugins.js") ) {
				// remove file reference
				group.remove(0, file);
				// remove ItemGroup if empty
				var new_group = group.findall('Content');
				if(new_group.length < 1) {
					this._solution.xml.getroot().remove(0, group);
				}
			}
		}
	} 
};

module.exports = win;
