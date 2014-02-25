var path            = require('path'),
    fs              = require('fs'),
    xml_helpers     = require('./util/xml-helpers'),
    events          = require('./events'),
    config_changes  = require('./util/config-changes');

var project = function(path){
    this._root = path;

    // 4.0
    // read from path/cordova/project.json
    this._meta = {};
    
};

project.prototype.getPlatform = function(){
    return this.platform;
};

project.prototype.getRoot = function(){
    return this._root;
};

project.prototype.getVersion = function(){
    if(this._meta.version)
        return this._meta.version;

    var binPath = path.join(this._root, 'cordova', 'version');
    
    // exec sync?
    return '3.0.0';
    
};

project.prototype.isValid = function(){
};

project.prototype.getPaths = function(){
    return {
        'www' : path.join(this._root, 'www')
    }
};

project.prototype.saveFile = function(path, data){
    return fs.writeFileSync(path, data, 'utf-8');
};


project.prototype.getPlugins = function(){
    var plugins_dir = this._getPluginsDir();

    var json = config_changes.get_platform_json(plugins_dir, this.platform);

    return Object.keys(json.installed_plugins).concat( Object.keys(json.dependent_plugins) );	
};

project.prototype._getPluginsDir = function(){
    // 3.x -- temp stuff
    // plugman only 
    var plugins_dir = path.join(this._root, 'cordova', 'plugins');

    // not ideal... go up to find cli directory
    if( !fs.existsSync(plugins_dir) )
        plugins_dir = path.join(this._root, '..', '..', 'plugins'); // platforms/android/../../plugins

    return plugins_dir;
};

// Update project meta data
project.prototype.updateMeta = function(){
    var paths = this.getPaths(),
        plugins = this.getPlugins();

    var plugins_dir = this._getPluginsDir();
    var moduleObjects = [];
    var pluginMetadata = {};
    var wwwDir = paths['www'];

    plugins.forEach(function(plugin) {
        var pluginDir = path.join(plugins_dir, plugin);

        if( !fs.statSync(pluginDir).isDirectory() ) {
            events.emit("warn", "Missing plugin '"+ plugin +"', not found at "+ pluginDir);
            return;
        }

        var xml = xml_helpers.parseElementtreeSync( path.join(pluginDir, 'plugin.xml'));
        var plugin_id = xml.getroot().attrib.id;

        pluginMetadata[plugin_id] = xml.getroot().attrib.version;

        var platformPluginsDir = path.join(wwwDir, 'plugins');
        var generalModules = xml.findall('./js-module');
        var platformTag = xml.find(util.format('./platform[@name="%s"]', platform));

        generalModules = generalModules || [];
        var platformModules = platformTag ? platformTag.findall('./js-module') : [];
        var allModules = generalModules.concat(platformModules);

        if(allModules.length)
            shell.mkdir('-p', platformPluginsDir);
        else
            shell.rmdir('-rf', platformPluginsDir);

        allModules.forEach(function(module) {
            // Copy the plugin's files into the www directory.
            // NB: We can't always use path.* functions here, because they will use platform slashes.
            // But the path in the plugin.xml and in the cordova_plugins.js should be always forward slashes.
            var pathParts = module.attrib.src.split('/');

            var fsDirname = path.join.apply(path, pathParts.slice(0, -1));
            var fsDir = path.join(platformPluginsDir, plugin_id, fsDirname);
            shell.mkdir('-p', fsDir);

            // Read in the file, prepend the cordova.define, and write it back out.
            var moduleName = plugin_id + '.';
            if (module.attrib.name) {
                moduleName += module.attrib.name;
            } else {
                var result = module.attrib.src.match(/([^\/]+)\.js/);
                moduleName += result[1];
            }

            var fsPath = path.join.apply(path, pathParts);
            var scriptContent = fs.readFileSync(path.join(pluginDir, fsPath), 'utf-8');
            scriptContent = 'cordova.define("' + moduleName + '", function(require, exports, module) { ' + scriptContent + '\n});\n';
            this.saveFile(path.join(platformPluginsDir, plugin_id, fsPath), scriptContent);

            // Prepare the object for cordova_plugins.json.
            var obj = {
                file: ['plugins', plugin_id, module.attrib.src].join('/'),
                id: moduleName
            };

            // Loop over the children of the js-module tag, collecting clobbers, merges and runs.
            module.getchildren().forEach(function(child) {
                if (child.tag.toLowerCase() == 'clobbers') {
                    if (!obj.clobbers) {
                        obj.clobbers = [];
                    }
                    obj.clobbers.push(child.attrib.target);
                } else if (child.tag.toLowerCase() == 'merges') {
                    if (!obj.merges) {
                        obj.merges = [];
                    }
                    obj.merges.push(child.attrib.target);
                } else if (child.tag.toLowerCase() == 'runs') {
                    obj.runs = true;
                }
            });

            // Add it to the list of module objects bound for cordova_plugins.json
            moduleObjects.push(obj);
        });
    });

    // Write out moduleObjects as JSON wrapped in a cordova module to cordova_plugins.js
    var final_contents = "cordova.define('cordova/plugin_list', function(require, exports, module) {\n";
    final_contents += 'module.exports = ' + JSON.stringify(moduleObjects,null,'    ') + ';\n';
    final_contents += 'module.exports.metadata = \n';
    final_contents += '// TOP OF METADATA\n';
    final_contents += JSON.stringify(pluginMetadata, null, '    ') + '\n';
    final_contents += '// BOTTOM OF METADATA\n';
    final_contents += '});'; // Close cordova.define.

    events.emit('verbose', 'Writing out cordova_plugins.js...');
    this.saveFile(path.join(wwwDir, 'cordova_plugins.js'), final_contents);
}

var proj = {

    cordova: project,

    forPlatform: function(platform, path){
        var p;

        switch(platform) {
            case 'wp8': 			
            case 'windows8': 
                p = require('./project/' + platform);
                break;

            default:
                p = new project(path);
        }
        p.platform = platform;

        return p;
    }
    
};

modules.exports = proj;
