var install = require('../src/install'),
    actions = require('../src/util/action-stack'),
    config_changes = require('../src/util/config-changes'),
    xml_helpers = require('../src/util/xml-helpers'),
    events  = require('../src/events'),
    plugman = require('../plugman'),
    platforms = require('../src/platforms/common'),
    common  = require('./common'),
    fs      = require('fs'),
    os      = require('os'),
    path    = require('path'),
    shell   = require('shelljs'),
    child_process = require('child_process'),
    semver  = require('semver'),
    Q = require('q'),
    spec    = __dirname,	
    done    = false,
    srcProject = path.join(spec, 'projects', 'android_install'),
    project = path.join(os.tmpdir(), 'plugman-test', 'android_install'),

    plugins_dir = path.join(spec, 'plugins'),
    plugins_install_dir = path.join(project, 'cordova', 'plugins'),	
    plugins = {
        'DummyPlugin' : path.join(plugins_dir, 'DummyPlugin'),
        'EnginePlugin' : path.join(plugins_dir, 'EnginePlugin'),
        'EnginePluginAndroid' : path.join(plugins_dir, 'EnginePluginAndroid'),
        'ChildBrowser' : path.join(plugins_dir, 'ChildBrowser'),
        'VariablePlugin' : path.join(plugins_dir, 'VariablePlugin'),
        'A' : path.join(plugins_dir, 'dependencies', 'A'),
        'C' : path.join(plugins_dir, 'dependencies', 'C')
    },
    promise,
    results = {}, 
    dummy_id = 'com.phonegap.plugins.dummyplugin';

function installPromise(f) {
  f.then(function() { done = true; }, function(err) { done = err; });
}

var existsSync = fs.existsSync;

// Mocked functions for tests
var fake = {
    'existsSync' : {
        'noPlugins' : function(path){
            // fake installed plugin directories as 'not found'
            if( path.slice(-5) !== '.json' && path.indexOf(plugins_install_dir) >= 0) {
                return false;
            }

            return existsSync(path);
        }
    },
    'fetch' : {
        'dependencies' : function(id, dir) {
            if(id == plugins['A'])
                return Q(id); // full path to plugin

            return Q( path.join(plugins_dir, 'dependencies', id) ); 
        }
    }
}

describe('start', function() {	
    var prepare, config_queue_add, proc, actions_push, ca, emit;

    beforeEach(function() {
        prepare = spyOn(plugman, 'prepare');
        config_queue_add = spyOn(config_changes, 'add_installed_plugin_to_prepare_queue');
        proc = spyOn(actions.prototype, 'process').andReturn( Q(true) );
        actions_push = spyOn(actions.prototype, 'push');
        ca = spyOn(actions.prototype, 'createAction');
    });
    it('start', function() {
        shell.rm('-rf', project);
        shell.cp('-R', path.join(srcProject, '*'), project);

        done = false;
        promise = Q()
         .then(
            function(){ return install('android', project, plugins['DummyPlugin']) }
        ).then(
            function(){ 
                results['actions_callCount'] = actions_push.callCount;
                results['actions_create'] = ca.argsForCall[0];
                results['config_add'] = config_queue_add.argsForCall[0];

                return Q();
            }
        ).then(
            function(){ return install('android', project, plugins['EnginePlugin']) }
        ).then(
            function(){
                emit = spyOn(events, 'emit');
                return install('android', project, plugins['ChildBrowser']) 
            }
        ).then(
            function(){ 
                return install('android', project, plugins['VariablePlugin'], plugins_install_dir, { cli_variables:{API_KEY:'batman'} }) 
            }
        ).then(
            function(){ 
                done = true;
                results['prepareCount'] = prepare.callCount;
                results['emit_results'] = [];

                for(var i in emit.calls) {
                    if(emit.calls[i].args[0] === 'results')
                        results['emit_results'].push(emit.calls[i].args[1]);
                }

                events.emit("verbose", "***** DONE START *****");
            }
        );
        waitsFor(function() { return done; }, 'promise never resolved', 500);		
    });
});

describe('install', function() {
    var chmod, exec, proc, add_to_queue, prepare, actions_push, c_a, mkdir, cp, rm, fetchSpy, emit;

    beforeEach(function() {
        prepare = spyOn(plugman, 'prepare').andReturn( Q(true) );
    
        exec = spyOn(child_process, 'exec').andCallFake(function(cmd, cb) {
            cb(false, '', '');
        });
        spyOn(fs, 'mkdirSync').andReturn(true);
        spyOn(shell, 'mkdir').andReturn(true);
        spyOn(platforms, 'copyFile').andReturn(true);

        fetchSpy = spyOn(plugman.raw, 'fetch').andReturn( Q( plugins['EnginePlugin'] ) );
        chmod = spyOn(fs, 'chmodSync').andReturn(true);
        fsWrite = spyOn(fs, 'writeFileSync').andReturn(true);
        cp = spyOn(shell, 'cp').andReturn(true);
        rm = spyOn(shell, 'rm').andReturn(true);
        add_to_queue = spyOn(config_changes, 'add_installed_plugin_to_prepare_queue');
        done = false;
    });

    describe('success', function() {
        it('should call prepare after a successful install', function() {
           expect(results['prepareCount']).toBe(4);
        });

        it('should emit a results event with platform-agnostic <info>', function() {
            // ChildBrowser
            expect(results['emit_results'][0]).toBe('No matter what platform you are installing to, this notice is very important.');
        });
        it('should emit a results event with platform-specific <info>', function() {
            // ChildBrowser
            expect(results['emit_results'][1]).toBe('Please make sure you read this because it is very important to complete the installation of your plugin.');
        });
        it('should interpolate variables into <info> tags', function() {
            // VariableBrowser
            expect(results['emit_results'][2]).toBe('Remember that your api key is batman!');
        });

        it('should call fetch if provided plugin cannot be resolved locally', function() {
            fetchSpy.andReturn( Q( plugins['DummyPlugin'] ) );
            spyOn(fs, 'existsSync').andCallFake( fake['existsSync']['noPlugins'] );

            runs(function() {
                installPromise(install('android', project, 'CLEANYOURSHORTS' ));
            });
            waitsFor(function() { return done; }, 'install promise never resolved', 200);
            runs(function() {
                expect(done).toBe(true);
                expect(fetchSpy).toHaveBeenCalled();
            });
        });

        it('should call the config-changes module\'s add_installed_plugin_to_prepare_queue method after processing an install', function() {																												
           expect(results['config_add']).toEqual([plugins_install_dir, dummy_id, 'android', {}, true]);
        });
        it('should notify if plugin is already installed into project', function() {
            var spy = spyOn(plugman, 'emit');
            get_json.andReturn({
                installed_plugins:{
                    'com.phonegap.plugins.dummyplugin':{}
                },
                dependent_plugins:{}
            });
            installPromise(install('android', temp, dummyplugin, plugins_dir, {}));
            waitsFor(function() { return done; }, 'install promise never resolved', 500);
            runs(function() {
                expect(spy).toHaveBeenCalledWith('results', 'Plugin "'+dummy_id+'" already installed on android.');
            });

        it('should queue up actions as appropriate for that plugin and call process on the action stack', 			
           function() {																											 				expect(results['actions_callCount']).toEqual(5);
                expect(results['actions_create']).toEqual([jasmine.any(Function), [jasmine.any(Object), path.join(plugins_install_dir, dummy_id), project, dummy_id], jasmine.any(Function), [jasmine.any(Object), project, dummy_id]]);
        });

        it('should check version if plugin has engine tag', function(){
            var satisfies = spyOn(semver, 'satisfies').andReturn(true);
            exec.andCallFake(function(cmd, cb) {
                cb(null, '2.5.0\n');
            });

            runs(function() {
                installPromise( install('android', project, plugins['EnginePlugin']) );
            });
            waitsFor(function() { return done; }, 'install promise never resolved', 200);
            runs(function() {
                expect(satisfies).toHaveBeenCalledWith('2.5.0','>=2.3.0');
            });
        });
        it('should check version and munge it a little if it has "rc" in it so it plays nice with semver (introduce a dash in it)', function() {
            var satisfies = spyOn(semver, 'satisfies').andReturn(true);
            exec.andCallFake(function(cmd, cb) {
                cb(null, '3.0.0rc1\n');
            });

            runs(function() {
                installPromise( install('android', project, plugins['EnginePlugin']) );
            });
            waitsFor(function() { return done; }, 'install promise never resolved', 200);
            runs(function() {
                expect(satisfies).toHaveBeenCalledWith('3.0.0-rc1','>=2.3.0');
            });
        });
        it('should check specific platform version over cordova version if specified', function() {
            var spy = spyOn(semver, 'satisfies').andReturn(true);
            exec.andCallFake(function(cmd, cb) {
                cb(null, '3.1.0\n');
            });
            fetchSpy.andReturn( Q( plugins['EnginePluginAndroid'] ) );

            runs(function() {
                installPromise( install('android', project, plugins['EnginePluginAndroid']) );
            });
            waitsFor(function() { return done; }, 'install promise never resolved', 200);
            runs(function() {
                expect(spy).toHaveBeenCalledWith('3.1.0','>=3.1.0');
            });
        });
        it('should check platform sdk version if specified', function() {
            var spy = spyOn(semver, 'satisfies').andReturn(true);
            fetchSpy.andReturn( Q( plugins['EnginePluginAndroid'] ) );
            exec.andCallFake(function(cmd, cb) {
                cb(null, '18\n');
            });

            runs(function() {
                installPromise( install('android', project, 'EnginePluginAndroid') );
            });
            waitsFor(function() { return done; }, 'install promise never resolved', 200);
            runs(function() {
                // <engine name="cordova" VERSION=">=3.0.0"/>
                // <engine name="cordova-android" VERSION=">=3.1.0"/>
                // <engine name="android-sdk" VERSION=">=18"/>

                expect(spy.calls.length).toBe(3);
                expect(spy.calls[0].args).toEqual([ '18.0.0', '>=3.0.0' ]);
                expect(spy.calls[1].args).toEqual([ '18.0.0', '>=3.1.0' ]);
                expect(spy.calls[2].args).toEqual([ '18.0.0','>=18' ]);
            });
        });
        it('should check engine versions', function() {
            var spy = spyOn(semver, 'satisfies').andReturn(true);
            fetchSpy.andReturn( Q( plugins['EnginePlugin'] ) );

            runs(function() {
                installPromise( install('android', project, plugins['EnginePlugin']) );
            });
            waitsFor(function() { return done; }, 'install promise never resolved', 200);
            runs(function() {
                // <engine name="cordova" version=">=2.3.0"/>
                // <engine name="cordova-plugman" version=">=0.10.0" />
                // <engine name="mega-fun-plugin" version=">=1.0.0" scriptSrc="megaFunVersion" platform="*" />
                // <engine name="mega-boring-plugin" version=">=3.0.0" scriptSrc="megaBoringVersion" platform="ios|android" />

				var plugmanVersion = require('../package.json').version;

                expect(spy.calls.length).toBe(4);
                expect(spy.calls[0].args).toEqual([ '', '>=2.3.0' ]);
                expect(spy.calls[1].args).toEqual([ plugmanVersion, '>=0.10.0' ]);
                expect(spy.calls[2].args).toEqual([ '', '>=1.0.0' ]);
                expect(spy.calls[3].args).toEqual([ '', '>=3.0.0' ]);
            });
        });
        it('should not check custom engine version that is not supported for platform', function() {
            var spy = spyOn(semver, 'satisfies').andReturn(true);
            runs(function() {
                installPromise( install('blackberry10', project, plugins['EnginePlugin']) );
            });
            waitsFor(function() { return done; }, 'install promise never resolved', 200);
            runs(function() {
                expect(spy).not.toHaveBeenCalledWith('','>=3.0.0');
            });
        });

        describe('with dependencies', function() {
            it('should install any dependent plugins if missing', function() {
                spyOn(fs, 'existsSync').andCallFake( fake['existsSync']['noPlugins'] );
                fetchSpy.andCallFake( fake['fetch']['dependencies'] );
                emit = spyOn(events, 'emit');

                exec.andCallFake(function(cmd, cb) {
                    cb(null, '9.0.0\n');
                });

                runs(function() {
                    installPromise( install('android', project, plugins['A']) );
                });
                waitsFor(function() { return done; }, 'install promise never resolved', 200);
                runs(function() {							  
                    // Look for 'Installing plugin ...' in events
                    var install = [], i;
                    for(i in emit.argsForCall) {
                        if(emit.argsForCall[i][1].substr(0, 10) === 'Installing')
                            install.push(emit.argsForCall[i][1]);
                    }

                    expect(install).toEqual([
                        "Installing plugin C",
                        "Installing plugin D",
                        "Installing plugin A"
                    ]);
                });
            });
            it('should install any dependent plugins from registry when url is not defined', function() {
                spyOn(fs, 'existsSync').andCallFake( fake['existsSync']['noPlugins'] );
                fetchSpy.andCallFake( fake['fetch']['dependencies'] );

                exec.andCallFake(function(cmd, cb) {
                    cb(null, '9.0.0\n', '');
                });

                // Plugin A depends on C & D
                runs(function() {
                    installPromise( install('android', project, plugins['A']) );
                });
                waitsFor(function() { return done; }, 'promise never resolved', 200);
                runs(function() {
                    // TODO: this is same test as above? Need test other dependency with url=?
                    var install = [], i;
                    for(i in emit.argsForCall) {
                        if(emit.argsForCall[i][1].substr(0, 10) === 'Installing')
                            install.push(emit.argsForCall[i][1]);
                    }

                    expect(install).toEqual([
                        "Installing plugin C",
                        "Installing plugin D",
                        "Installing plugin A"
                    ]);;
                });
            });
        });
    });

    xdescribe('failure', function() {
        it('should throw if platform is unrecognized', function() {
            runs(function() {
                installPromise( install('atari', project, 'SomePlugin') );
            });
            waitsFor(function() { return done; }, 'install promise never resolved', 200);
            runs(function() {
                expect(done).toEqual(new Error('atari not supported.'));
            });
        });
        it('should throw if variables are missing', function() {
            runs(function() {
                installPromise( install('android', project, plugins['VariablePlugin']) );
            });
            waitsFor(function(){ return done; }, 'install promise never resolved', 200);
            runs(function() {
                expect(done).toEqual(new Error('Variable(s) missing: API_KEY'));
            });
        });
        it('should throw if git is not found on the path and a remote url is requested', function() {
            spyOn(fs, 'existsSync').andCallFake( fake['existsSync']['noPlugins'] );
            var which_spy = spyOn(shell, 'which').andReturn(null);
            runs(function() {
                installPromise( install('android', project, 'https://git-wip-us.apache.org/repos/asf/cordova-plugin-camera.git') );
            });
            waitsFor(function(){ return done; }, 'install promise never resolved', 200);
            runs(function() {
                expect(done).toEqual(new Error('"git" command line tool is not installed: make sure it is accessible on your PATH.'));
            });
        });
        it('should throw if plugin version is less than the minimum requirement', function(){
            var spy = spyOn(semver, 'satisfies').andReturn(false);
            exec.andCallFake(function(cmd, cb) {
                cb(null, '0.0.1\n');
            });
            runs(function() {
                installPromise( install('android', project, plugins['EnginePlugin']) );
            });
            waitsFor(function(){ return done; }, 'install promise never resolved', 200);
            runs(function() {
                expect(done).toEqual(new Error('Plugin doesn\'t support this project\'s cordova version. cordova: 0.0.1, failed version requirement: >=2.3.0'));
            });
        });
    });

});


describe('end', function() {
                         
    it('end', function() {
        done = false;
        var finish = function(err){
            if(err)
                events.emit('error', err);

            shell.rm('-rf', project);
            done = true;	
        }

        promise.then( 

        ).then(finish).fail(finish);

        waitsFor(function() { return done; }, 'promise never resolved', 500);
    });
});
