'use strict';

angular.module('ngSocketResource', []).factory('$socketResource', function(Socket, $resource, $rootScope, $timeout)
    {
        var idField = '_id';

        var SocketbaseFactory = function(url, paramDefaults, actions, options)
        {
            // Getting the 'module' from the URL, eg '/api/messages/:messageId' -> 'messages'.
            // This is used to know which $socketResources to notify of changes.

            var apiIndex = url.indexOf('api/');
            var moduleStart = apiIndex === -1 ? 0 : apiIndex + 4;
            var module = url.substr(moduleStart);
            module = module.substr(0, module.indexOf('/'));
            //console.log(url, module);

            var SocketResource = function(data)
            {
                this.setData(data);
            };

            SocketResource.prototype.setData = function(data)
            {
                for(var key in data)
                {
                    if(data.hasOwnProperty(key))
                    {
                        this[key] = data[key];
                    }
                }
            };

            SocketResource.prototype.getData = function()
            {
                var data = {};

                for(var key in this)
                {
                    if(this.hasOwnProperty(key) && key[0] !== '$')
                    {
                        data[key] = this[key];
                    }
                }

                return data;
            };

            SocketResource.resource = $resource(url, paramDefaults, actions, options);

            SocketResource.get = function()
            {
                var getter = SocketResource.resource.get.apply(SocketResource.resource, arguments);
                var resrc = new SocketResource(getter);

                getter.$promise.then(function(resource)
                {
                    resrc.setData(resource);

                    Socket.on('update-' + module, function (updatedContent)
                    {
                        if(resource[idField] == updatedContent[idField])
                        {
                            resrc.setData(updatedContent);
                        }
                    });
                });

                return resrc;
            };

            SocketResource.prototype.$save = function(parameters, callback, onE)
            {
                var data = this.getData();
                if(typeof parameters == 'function')
                {
                    onE = callback;
                    callback = parameters;
                }

                return SocketResource.resource.save.call(SocketResource.resource, data, function(resource, cb)
                {
                    var socketObj = { module: module, url: url, data: resource };
                    if(parameters && parameters.restrictToUserIds) socketObj.restrictToUserIds = parameters.restrictToUserIds;
                    Socket.emit('save', socketObj);
                    if(callback) callback.call(callback, new SocketResource(resource), cb);
                }, onE);
            };
            SocketResource.prototype.$update = function(parameters, callback)
            {
                var data = this.getData();
                if(typeof parameters == 'function')
                {
                    callback = parameters;
                }

                var socketObj = { module: module, url: url, data: data };
                if(parameters && parameters.restrictToUserIds) socketObj.restrictToUserIds = parameters.restrictToUserIds;
                Socket.emit('update', socketObj);

                //var args = Array.prototype.slice.call(arguments); // Convert into array
                //args.unshift(data); // Add the data as first argument

                return SocketResource.resource.update.call(SocketResource.resource, parameters, data, callback);
            };

            SocketResource.update = function(limit, res)
            {
                Socket.emit('update', { module: module, url: url, data: res });

                return SocketResource.resource.update.apply(SocketResource.resource, arguments);
            };

            var meetsRequirements = function(resource, requirements)
            {
                if(!requirements)
                {
                    return true;
                }
                else
                {
                    for(var key in requirements)
                    {
                        if(requirements.hasOwnProperty(key) && resource[key])
                        {
                            var resourceValueIsArray = resource[key].constructor === Array;
                            var requirementValueIsArray = requirements[key].constructor === Array;
                            var resourceHasIdAndValueIsString = resource[key].hasOwnProperty('_id') && typeof requirements[key] == 'string';

                            if(requirementValueIsArray && !resourceValueIsArray)
                            {
                                // If the requirement value is an array, a resource with the value thats within the array
                                // should be accepted.

                                if(requirements[key].indexOf(resource[key]) === -1)
                                {
                                    return false;
                                }
                            }
                            else if(resourceHasIdAndValueIsString)
                            {
                                // eg user._id, and userId.
                                return resource[key]._id == requirements[key];
                            }
                            else
                            {
                                // Otherwise, check if the values are simply the same.

                                if(resource[key] != requirements[key])
                                {
                                    return false;
                                }
                            }
                        }
                    }
                    return true;
                }
            };

            SocketResource.query = function(parameters)
            {
                //console.log('querying', Resource.resource, arguments);
                //console.log(arguments);
                //Resource.resource.query.call(Resource.resource, arguments);

                var doQuery = function(args) { return SocketResource.resource.query.apply(SocketResource.resource, args); };
                var query = doQuery(arguments);

                query.$promise.then(function (results)
                {
                    results.downloadedUpdates = [];

                    // Converting the Resources into SocketResources so their changes go through this module as well..
                    for(var i in results)
                    {
                        // isNaN check for some properties like $promise and $resolved.
                        if(results.hasOwnProperty(i) && !isNaN(i))
                        {
                            results[i] = new SocketResource(results[i]);
                        }
                    }

                    Socket.on('save-' + module, function (newContent)
                    {
                        if(meetsRequirements(newContent, parameters))
                        {
                            var index = results.map(function(result) { return result[idField]; }).indexOf(newContent[idField]);

                            if(index == -1)
                            {
                                //console.log('adding to list..', results, newContent);
                                var newSocketResource = new SocketResource(newContent);

                                results.push(newSocketResource);
                                results.downloadedUpdates.push({type: 'save', time: new Date(), content: newSocketResource });
                            }
                        }
                    });
                    Socket.on('update-' + module, function (updatedContent)
                    {
                        //console.log('received update');
                        for(var i in results)
                        {
                            if(results.hasOwnProperty(i))
                            {
                                var result = results[i];
                                var id = result[idField];

                                if(result[idField] == updatedContent[idField])
                                {
                                    results[i] = new SocketResource(updatedContent);
                                    results.downloadedUpdates.push({type: 'update', time: new Date(), content: results[i] });
                                    //console.log(results.downloadedUpdates);
                                    break;
                                }
                            }
                        }
                    });
                    Socket.on('remove-' + module, function (deletedContent)
                    {
                        var index = -1;

                        for(var i in results)
                        {
                            if(results.hasOwnProperty(i))
                            {
                                var result = results[i];
                                var id = result[idField];

                                if(result[idField] == deletedContent[idField])
                                {
                                    index = i;
                                    break;

                                    //results[i] = null; // This only sets the data to null, but doesnt update the array
                                    //delete results[i]; // This doesnt work
                                }
                            }
                        }

                        if(index !== -1)
                        {
                            var result = results[index];
                            results.splice(index, 1); // This updates the array and takes out the deleted element.

                            results.downloadedUpdates.push({type: 'remove', time: new Date(), content: result  });
                        }
                    });
                });

                return query;
            };

            SocketResource.prototype.$remove = function()
            {
                var data = this.getData();

                Socket.emit('remove', { module: module, url: url, data: data });
                //console.log('emitted remove..');

                var args = Array.prototype.slice.call(arguments); // Convert into array
                if(args.length == 0)
                {
                    args.push({});
                }
                args.push(data);

                return SocketResource.resource.delete.apply(SocketResource.resource, args);
            };

            return SocketResource;
        };

        return SocketbaseFactory;
    })
    // From http://briantford.com/blog/angular-socket-io
    .factory('Socket', function ($rootScope)
    {
        var socket = io.connect();

        return {
            on: function (eventName, callback) {
                //console.log('listening...');
                socket.on(eventName, function () {
                    var args = arguments;
                    $rootScope.$apply(function () {
                        callback.apply(socket, args);
                    });
                });
            },
            emit: function (eventName, data, callback) {
                //console.log('emitting...');
                socket.emit(eventName, data, function () {
                    var args = arguments;
                    $rootScope.$apply(function () {
                        if (callback) {
                            callback.apply(socket, args);
                        }
                    });
                })
            }
        };
    });
