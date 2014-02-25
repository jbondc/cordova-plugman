var registry = require('./registry/registry')

module.exports = function(plugin_paths) {
    // plugin_path is an array of paths
    return registry.publish(plugin_paths);
}
