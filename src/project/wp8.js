var path      = require('path'),
    fs        = require('fs'),
    windows   = require('../platforms/wp8'),
    project   = require('../project');

var winProject = function(){
    project.cordova.apply(this, arguments);
    this._solution = windows.parseProjectFile(this._root);
};

winProject.prototype = new project.cordova;

winProject.prototype.checkFiles = function(){
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
winProject.prototype.saveFile = function(path, data) {
    this._solution.addSourceFile(path);

    return project.cordova.apply(this, arguments);
}

module.exports = winProject;
