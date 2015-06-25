'use strict';

angular.module('ngSocketResource', []).factory('$socketResource', function(Socket, $resource, $rootScope, $timeout)
    {
        var idField = '_id';

        var SocketbaseFactory = function(url, paramDefaults, actions, options)
        {
            var module = url.substr(0, url.indexOf('/'));

            var Resource = function(data)
            {
                this.setData(data);
            };

            Resource.prototype.setData = function(data)
            {
                for(var key in data)
                {
                    if(data.hasOwnProperty(key))
                    {
                        this[key] = data[key];
                    }
                }
            };

            Resource.prototype.getData = function()
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

            Resource.resource = $resource(url, paramDefaults, actions, options);

            Resource.get = function()
            {
                var getter = Resource.resource.get.apply(Resource.resource, arguments);
                var resrc = new Resource(getter);

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

            Resource.prototype.$save = function()
            {
                var data = this.getData();
                //console.log(data);

                Socket.emit('save', { module: module, url: url, data: data });

                var args = Array.prototype.slice.call(arguments); // Convert into array
                args.unshift(data); // Add the data as first argument

                return Resource.resource.save.apply(Resource.resource, args);
            };
            Resource.prototype.$update = function()
            {
                var data = this.getData();

                Socket.emit('update', { module: module, url: url, data: data });

                var args = Array.prototype.slice.call(arguments); // Convert into array
                args.unshift(data); // Add the data as first argument

                return Resource.resource.update.apply(Resource.resource, args);
            };

            Resource.update = function(limit, res)
            {
                Socket.emit('update', { module: module, url: url, data: res });

                return Resource.resource.update.apply(Resource.resource, arguments);
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
                            if(resource[key] !== requirements[key])
                            {
                                return false;
                            }
                        }
                    }
                    return true;
                }
            };

            Resource.query = function(parameters)
            {
                //console.log('querying', Resource.resource, arguments);
                //console.log(arguments);
                //Resource.resource.query.call(Resource.resource, arguments);

                var doQuery = function(args) { return Resource.resource.query.apply(Resource.resource, args); };
                var query = doQuery(arguments);

                query.$promise.then(function (results)
                {
                    Socket.on('save-' + module, function (newContent)
                    {
                        if(meetsRequirements(newContent, parameters))
                        {
                            results.push(newContent);
                        }
                    });
                    Socket.on('update-' + module, function (updatedContent)
                    {
                        for(var i in results)
                        {
                            if(results.hasOwnProperty(i))
                            {
                                var result = results[i];
                                var id = result[idField];

                                if(result[idField] == updatedContent[idField])
                                {
                                    results[i] = updatedContent;
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
                        }
                    });
                });

                return query;
            };

            Resource.prototype.$remove = function()
            {
                var data = this.getData();

                Socket.emit('remove', { module: module, url: url, data: data });
                //console.log('emitted remove..');

                var args = Array.prototype.slice.call(arguments); // Convert into array
                args.unshift(data); // Add the data as first argument
                args.unshift({});

                return Resource.resource.delete.apply(Resource.resource, args);
            };

            return Resource;
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
