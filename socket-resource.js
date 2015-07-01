'use strict';

angular.module('ngSocketResource', []).factory('$socketResource', function(Socket, $resource, $rootScope, $timeout)
    {
        var idField = '_id';

        var SocketbaseFactory = function(url, paramDefaults, actions, options)
        {
            var module = url.substr(0, url.indexOf('/'));

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

            SocketResource.prototype.$save = function(parameters, callback)
            {
                var data = this.getData();
                if(typeof parameters == 'function')
                {
                    callback = parameters;
                }

                return SocketResource.resource.save.call(SocketResource.resource, data, function(resource, cb)
                {
                    var socketObj = { module: module, url: url, data: resource };
                    if(parameters.restrictToUserIds) socketObj.restrictToUserIds = parameters.restrictToUserIds;
                    Socket.emit('save', socketObj);
                    callback.call(callback, new SocketResource(resource), cb);
                });
            };
            SocketResource.prototype.$update = function(parameters, callback)
            {
                var data = this.getData();
                if(typeof parameters == 'function')
                {
                    callback = parameters;
                }

                var socketObj = { module: module, url: url, data: data };
                if(parameters.restrictToUserIds) socketObj.restrictToUserIds = parameters.restrictToUserIds;
                Socket.emit('update', socketObj);

                //var args = Array.prototype.slice.call(arguments); // Convert into array
                //args.unshift(data); // Add the data as first argument

                return SocketResource.resource.update.call(SocketResource.resource, data, parameters, callback);
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
                        if(requirements.hasOwnProperty(key))
                        {
                            var resourceValueIsArray = resource[key].constructor === Array;
                            var requirementValueIsArray = requirements[key].constructor === Array;

                            if(requirementValueIsArray && !resourceValueIsArray)
                            {
                                // If the requirement value is an array, a resource with the value thats within the array
                                // should be accepted.

                                if(requirements[key].indexOf(resource[key]) === -1)
                                {
                                    return false;
                                }
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

                                results.push(new SocketResource(newContent));
                                results.downloadedUpdates.push({type: 'save', time: new Date() });
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
                                    results.downloadedUpdates.push({type: 'update', time: new Date() });
                                    console.log(results.downloadedUpdates);
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
                            results.splice(index, 1); // This updates the array and takes out the deleted element.

                            results.downloadedUpdates.push({type: 'remove', time: new Date() });
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
                args.unshift(data); // Add the data as first argument
                args.unshift({});

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
