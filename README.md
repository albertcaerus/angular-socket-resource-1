# angular-socket-resource

This module takes care of automatic real time updates in your [MEAN](http://meanjs.org/) application, updating the data 
in your [angular](https://angularjs.org/) controllers when there are updates on the server, in [mongoDB](https://www.mongodb.org/). This is done using [Socket.io](http://socket.io/).

All you need to do is follow the instructions below to set up the server-side events, and then replace `$resource` with `$socketResource` on the client side.

## Demo

Check out the demo at http://angular-socket-resource-demo.michaschwab.de.

See the magic by opening the website in two browser windows, editing the articles in one, and seeing live updates in the other window.

More details in the [demo github project](https://github.com/michaschwab/angular-socket-resource-demo).

## What do I have to do in my controller?

Usually: nothing! Just a tiny tweak to your services: replace `$resource` with `$socketResource`.

Really anything with simple mongo queries works. In the demo, I use take yeoman's default Articles controller:


    $scope.find = function() {
        $scope.articles = Articles.query();
    };

This will bind the list of articles to the current scope, and display them as list in the template.

Now, the service that defines what an Article is uses `$resource`, fetching the data from the server with single HTTP requests.
After replacing that with `$socketResource`, it will not only fetch the data, but also wait for Socket.io events


## Installation

Before Installation, please be aware of the possible security threat imposed by this module as described further below.
If you want to use this for sensitive data you should install [passport.socketio](https://github.com/jfromaniello/passport.socketio) first.

1. Make sure socket.io works. If it's not yet in use, add socket.io as dependency to package.json

        "socket.io": "^1.3.5",
    
    Then, include it in your template and ensure it's initiated:

        <script src="/socket.io/socket.io.js"></script>
        
        <script type="text/javascript">
            var socket = io();
        </script>
        
2. Install [passport.socketio](https://github.com/jfromaniello/passport.socketio) so this works can synchronize sensitive data! If you don't need that you can skip this step.
    
3. Edit your server.js to include the following code:

        var server = require('http').Server(app);
        var io = require("socket.io")(server);
        
        // Stuff for passport.socketio here
        // ......
        // And then...
        
        if(!passportSocketIo)
        {
            console.log("WARNING: passportSocketIo is not working, so all data with be sent to everyone!!")
        }
    
        io.on('connection', function(socket)
        {
            var currentSocketId = socket.id;
    
            socket.on('save', function(data)
            {
                var mod = data.module;
                var entry = data.data;
                var restrictToUserIds = data.restrictToUserIds ? data.restrictToUserIds : false;
    
                if(restrictToUserIds && passportSocketIo)
                {
                    var restrictedUserIds = restrictToUserIds.constructor === Array ? restrictToUserIds : [restrictToUserIds];
    
                    passportSocketIo.filterSocketsByUser(io, function(user)
                    {
                        return restrictedUserIds.indexOf(user._id) !== -1;
                    }).forEach(function(socket)
                    {
                        socket.emit('save-' + mod, entry);
                    });
                }
                else
                {
                    // Send to everyone
                    io.sockets.emit('save-' + mod, entry);
                }
            });
    
            socket.on('update', function(data)
            {
                var mod = data.module;
                var entry = data.data;
    
                var restrictToUserIds = data.restrictToUserIds ? data.restrictToUserIds : false;
    
                if(restrictToUserIds && passportSocketIo)
                {
                    var restrictedUserIds = restrictToUserIds.constructor === Array ? restrictToUserIds : [restrictToUserIds];
    
                    passportSocketIo.filterSocketsByUser(io, function(user)
                    {
                        return restrictedUserIds.indexOf(user._id) !== -1;
                    }).forEach(function(socket)
                    {
                        // Assuming that the active socket will take care of updating himself.
                        if(socket.id !== currentSocketId)
                        {
                            socket.emit('update-' + mod, entry);
                        }
                    });
                }
                else
                {
                    // Send to everyone
                    socket.broadcast.emit('update-' + mod, entry);
                }
            });
    
            socket.on('remove', function(data)
            {
                var mod = data.module;
                var entry = data.data;
    
                io.sockets.emit('remove-' + mod, entry);
            });
        });
    
    
    
4. Add angular-socket-resource to bower.json and run `bower install`.

5. Include lib/angular-socket-resource/socket-resource.js in your template .

6. Add ngSocketResource to your angular app dependencies.

7. In the services in which you want real time updates, replace `$resource` with `$socketResource`.

8. For restricting the users that see the real time updates of sensitive data, add a `restrictToUserIds` parameter to the appropriate $save and $update calls.
That way you can specify the users that are allowed to get the update (such as the user you are sending a private message to). 

You should be all set!

## Security
This module is **definitely insecure** and will make the data you create, edit and delete with this module **readable by all your clients**, because it bypasses the security checks in place on your node server.

**This module should NOT be used for confidential data.** Just use the regular `$resource` for that data, and use this module's `$socketResource` where security is not an issue.

## How does this work?
This module wraps the angular `$resource` module and adds some functionality to some of its functions.

The `query()` function for example is enriched: In addition to loading the data from the server using an HTTP request,
`angular-socket-resource` then listens to socket.io events of the data changing. When that happens, the data returned from `query()` is updated,
and you don't have to do anything in the controller.

Similar things happen for `get()`, and the `$remove()`, `$save()` and `create()` methods trigger those socket.io events.

This is pretty simple and should be quite fast.

The simplicity is some of the downside of this approach: It bypasses the server evaluations of the queries you are sending. 
This results in the security issues mentioned above, and in query filters, or mongodb sorting, and every other kind of fancy query stuff, to fail.

Many projects however don't rely on those heavily and are able to do all data filtering, sorting etc on the client side afterwards, and can do all that every time the data changes, using angular's `$watch()` feature.

Therefore I recommend this to all MEAN projects that don't have really really big databases, and that can use this for non-confidential data. 

## Feedback and questions
Please do send me comments, questions, feedback and pull requests! I hope this is useful.