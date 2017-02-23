/**
 * @author Santhosh Vasabhaktula <santhosh@ilimi.in>
 */
EkstepEditor.pluginManager = new (Class.extend({
    plugins: {},
    pluginObjs: {},
    pluginInstances: {},
    errors: [],
    init: function() {
        console.log("Plugin manager initialized");
    },
    registerPlugin: function(manifest, plugin, url) {
        this.plugins[manifest.id] = {p: plugin, m: manifest, 'url': url};
        var p = new plugin(manifest); // Initialize plugin
        this.pluginObjs[manifest.id] = p;
    },
    loadAndInitPlugin: function(pluginFQName) {
        var index = pluginFQName.lastIndexOf('-');
        var pluginId = pluginFQName.substr(0, index);
        var version = pluginFQName.substr(index + 1);
        this.loadPlugin(pluginId, version);
        if(this.isDefined(pluginId)) {
            var pluginManifest = this.getPluginManifest(pluginId);
            this.invoke(pluginId, _.cloneDeep(pluginManifest.editor['init-data'] || {}), EkstepEditorAPI.getCurrentStage());
            return 0;
        } else {
            return 1;
        }
    },
    loadPlugin: function(pluginId, pluginVer) {
        var instance = this;
        if(this.plugins[pluginId]) {
            console.log('A plugin with id "' + pluginId + '" and ver "' + pluginVer + '" is already loaded');
        } else {
            EkstepEditor.resourceManager.loadManifest(pluginId, pluginVer, function(err, data) {
                if(err) {
                    console.error('Unable to find plugin ' + pluginId);
                } else {
                    instance.loadPluginByManifest(data.manifest, data.url);
                }
            });
        }
    },
    loadPluginByManifest: function(manifest, url) {
        var instance = this;
        EkstepEditor.resourceManager.loadPluginResource(manifest.id, manifest.ver, manifest.editor.main, 'text', function(err, data) {
            if (err) {
                console.error('Unable to load plugin js', manifest.editor.main);
            } else {
                instance.loadDependencies(manifest, url);
                try {
                    instance.registerPlugin(manifest, eval(data), url);
                    if (manifest.type && EkstepEditorAPI._.lowerCase(manifest.type) === "widget") {
                        instance.invoke(pluginId, _.cloneDeep(manifest.editor['init-data'] || {}), EkstepEditorAPI.getCurrentStage());
                    }
                } catch (e) {
                    console.error("error while loading plugin:" + manifest.id, e);
                }
            }
        },url);
    },
    loadDependencies: function(manifest, url) {
        var instance = this;
        if (_.isArray(manifest.editor.dependencies)) {
            _.forEach(manifest.editor.dependencies, function(dependency) {
                if (dependency.type == 'plugin') {
                    console.log(dependency.plugin,dependency.ver);
                    instance.loadPlugin(dependency.plugin, dependency.ver);
                } else {
                    EkstepEditor.resourceManager.loadExternalResource(dependency.type, manifest.id, manifest.ver, dependency.src, url);
                }
            });
        }
    },
    isDefined: function(id) {
        if (this.plugins[id]) {
            return true;
        } else {
            return false;
        }
    },
    invoke: function(id, data, parent, override) {
        var instance = this;
        var p = undefined;
        var plugin = this.plugins[id];
        if (!plugin) {
            this.addError('No plugin found for - ' + id);
        } else {
            var pluginClass = override ? plugin.p.extend(override) : plugin.p;
            var pluginManifest = plugin.m;
            if (_.isArray(data)) {
                data.forEach(function(d) {
                    p = new pluginClass(pluginManifest, d, parent);
                    instance.addPluginInstance(p);
                    p.initPlugin();
                    instance.dispatchTelemetry(pluginManifest, p, parent);
                })
            } else {
                p = new pluginClass(pluginManifest, data, parent);
                instance.addPluginInstance(p);
                p.initPlugin();
                instance.dispatchTelemetry(pluginManifest, p, parent);
            }
        }
        return p;
    },
    dispatchTelemetry: function(pluginManifest, pluginInstance, parent) {
        var stageId = parent ? parent.id : "";
        if (!EkstepEditor.stageManager.contentLoading) EkstepEditor.telemetryService.pluginLifeCycle({type: 'instance', pluginid: pluginManifest.id, pluginver: pluginManifest.ver, objectid: pluginInstance.id, stage: stageId, containerid: "", containerplugin: ""});
    },
    addPluginInstance: function(pluginObj) {
        this.pluginInstances[pluginObj.id] = pluginObj;
    },
    removePluginInstance: function(pluginObj) {        
        if (pluginObj) pluginObj.remove();
    },
    getPluginInstance: function(id) {
        return this.pluginInstances[id];
    },
    getPluginManifest: function(id) {
        var plugin = this.plugins[id];
        if (plugin) {
            return plugin.m;
        } else {
            return undefined;
        }
    },
    addError: function(error) {
        this.errors.push(error);
    },
    getErrors: function() {
        return this.errors;
    },
    cleanUp: function() {
        this.pluginInstances = {};
        this.plugins = {};
        this.errors = [];
    },
    getPlugins: function() {
        return Object.keys(this.plugins);
    },
    getPluginType: function(id) {
        if(this.pluginInstances[id]) {
            return this.pluginInstances[id].getType();
        } else {
            return '';
        }
    },
    loadAllPlugins: function (plugins, callback) {
        var startTime = (new Date()).getTime();
        var instance = this;
        var q = async.queue(function(plugin, pluginCallback) {
            instance.loadPlugin(plugin.key, plugin.value);
            pluginCallback();
        },6);

        // assign a callback
        q.drain = function() {
            callback();
            EkstepEditor.telemetryService.startEvent().append("loadtimes", { plugins: ((new Date()).getTime() - startTime) });
        };
        _.forIn(plugins, function(value, key) {
            q.push({ "key": key, "value": value }, function(err) {});
        });
    }
}));