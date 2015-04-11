var app = require('express')();
var http = require('http').Server(app);
var fs = require('fs');
var Cookies = require('cookies');
var io = require('socket.io')(http);
var SocketIOFileUpload = require('socketio-file-upload');
var ssh2 = require('ssh2');


var MathServer = function (overrideOptions) {
    var options = {
        port: 8002, // default port number to use
        PRUNE_CLIENT_INTERVAL: 1000 * 60 * 10, // 10 minutes
        MAX_AGE: 1000 * 60 * 60 * 24 * 7, // 1 week
        CONTAINERS: './dummy_containers.js',
        MATH_PROGRAM: "Macaulay2",
        MATH_PROGRAM_COMMAND: 'M2'
    };

    var overrideDefaultOptions = function (overrideOptions) {
        for (var opt in overrideOptions) {
            if (options.hasOwnProperty(opt)) {
                options[opt] = overrideOptions[opt];
                console.log("server option: " + opt + " set to " + options[opt]);
            }
        }
    };

    overrideDefaultOptions(overrideOptions);


    var cookieName = "try" + options.MATH_PROGRAM;

    var totalUsers = 0; //only used for stats: total # users since server started

    // Global array of all Client objects.  Each has a math program process.
    var clients = {};
    if (!options.CONTAINERS) {
        console.log("error, no container management given.");
        throw ("No CONTAINERS!");
    }

    var credentialManager = require(options.CONTAINERS).manager();

    // preamble every log with the client ID
    var logClient = function (clientID, str) {
        console.log(clientID + ": " + str);
    };

    var deleteClient = function (clientID) {
        credentialManager.removeCredentials(clients[clientID].credentials);
        delete clients[clientID];
    };

    var timeBeforeInterval = function (timeInterval) {
        var now = Date.now();
        console.log("It is currently " + now + " milliseconds.");
        return now - timeInterval;
    };

    var removeOldClients = function (minimalLastActiveTimeForClient) {
        for (var clientID in clients) {
            if (clients.hasOwnProperty(clientID)) {
                if (clients[clientID].lastActiveTime < minimalLastActiveTimeForClient) {
                    deleteClient(clientID);
                }
            }
        }
    };

    var logCurrentlyActiveClients = function () {
        for (var clientID in clients) {
            if (clients.hasOwnProperty(clientID)) {
                console.log(clientID);
            }
        }
    };

    var pruneClients = function () {
        console.log("Pruning clients...");
        var minimalLastActiveTimeForClient = timeBeforeInterval(options.MAX_AGE);
        removeOldClients(minimalLastActiveTimeForClient);
        console.log("Done pruning clients...  Continuing clients:");
        logCurrentlyActiveClients();
    };


    var Client = function () {
        this.recentlyRestarted = false;
        this.lastActiveTime = Date.now(); // milliseconds when client was last active
        this.credentials = 0;
    };

    var clientIDExists = function (clientID) {
        if (clients[clientID] == null) {
            return false;
        }
        logClient(clientID, "Client already exists");
        return true;
    };

    var getNewClientID = function () {
        totalUsers += 1;
        do {
            var clientID = Math.random() * 1000000;
            clientID = Math.floor(clientID);
        } while (clientIDExists(clientID));
        clientID = "user" + clientID.toString(10);
        console.log("New Client ID " + clientID);
        return clientID;
    };

    var setCookie = function (cookies, clientID) {
        cookies.set(cookieName, clientID, {
            httpOnly: false
        });
    };

    var getCredentials = function (clientID, next) {
        if (clients[clientID].credentials) {
            next(clients[clientID].credentials);
        } else {
            credentialManager.getNewCredentials(next);
        }
    };

    /*var getSSHOptions = function (credentials) {
     // ssh -t fs "stty isig intr ^N -echoctl ; trap '/bin/true' SIGINT; sleep 1000; echo f" > foo
     var sshOptions = ["-q", "-o", "StrictHostKeyChecking=no"];
     if (credentials.sshKey) {
     sshOptions.push("-i");
     sshOptions.push(credentials.sshKey);
     }
     if (credentials.port){
     sshOptions.push("-p");
     sshOptions.push(credentials.port);
     }
     if (credentials.username) {
     sshOptions.push(credentials.username + "@" + credentials.host);
     } else {
     sshOptions.push(credentials.host);
     }
     //sshOptions.push("stty isig intr ^N; trap '/bin/true' SIGINT; " + options.MATH_PROGRAM_COMMAND);
     return sshOptions;
     };*/

    var spawnMathProgramInSecureContainer = function (clientID, next) {
        getCredentials(clientID, function (credentials) {
            clients[clientID].credentials = credentials;
            var connection = new ssh2.Client();
            connection.on('ready', function () {
                connection.exec(options.MATH_PROGRAM_COMMAND, {pty: true}, function (err, stream) {
                    if (err) throw err;
                    stream.on('close', function () {
                        connection.end();
                    });
                    stream.on('end', function () {
                        stream.close();
                        console.log('I ended.');
                        //connection.end();
                    });
                    next(stream);
                    /*connection.on('end', function(){
                        delete stream;
                        delete connection;
                    });*/
                });
            }).connect({
                host: credentials.host,
                port: credentials.port,
                username: credentials.username,
                privateKey: fs.readFileSync(credentials.sshKey)
            });

        });
    };

    var mathProgramStart = function (clientID, next) {
        logClient(clientID, "Spawning new MathProgram process...");
        spawnMathProgramInSecureContainer(clientID, function (stream) {
            stream.setEncoding("utf8");
            clients[clientID].mathProgramInstance = stream;
            attachListenersToOutput(clientID);
            if(next){
                next(clientID);
            }
        });
    };

    var captureSpecialEvent = function (data) {
        var eventData = data.match(/>>SPECIAL_EVENT_START>>(.*)<<SPECIAL_EVENT_END/);
        if (eventData) {
            // console.log("Have special event: " + eventData[1]);
            return eventData[1];
        }
    };

    var emitUrlForUserGeneratedFileToClient = function (clientId, path) {
        var partAfterLastSlash = /([^\/]*)$/;
        var fileName = path.match(partAfterLastSlash);
        if (fileName) {
            fileName = fileName[0];
        } else {
            return;
        }
        var sshConnection = ssh2();

        sshConnection.on('end', function () {
            console.log("Image action ended.");
        });

        sshConnection.on('ready', function () {
            sshConnection.sftp(function (err, sftp) {
                var folderName = "/files/";
                fs.mkdir("./public" + folderName, function(err){
                    if(err){
                        console.log("Folder exists, but we proceed anyway");
                    }
                    sftp.fastGet(path, "./public" + folderName + fileName, function (error) {
                        if (error) {
                            console.log("Error while downloading image. PATH: " + path + ", ERROR: " + error);
                        }
                        clients[clientId].socket.emit("image", folderName + fileName);
                    });
                });
            });
        });

        sshConnection.connect(
            {
                host: clients[clientId].credentials.host,
                port: clients[clientId].credentials.port,
                username: clients[clientId].credentials.username,
                privateKey: fs.readFileSync(clients[clientId].credentials.sshKey)
            }
        );

    };

    var emitHelpUrlToClient = function (clientID, viewHelp) {
        console.log("Look at " + viewHelp);
        var helpPath = viewHelp.match(/(\/Macaulay2Doc.*)$/);
        if (helpPath) {
            helpPath = helpPath[0];
        } else {
            return;
        }
        helpPath = "http://www.math.uiuc.edu/Macaulay2/doc/Macaulay2-1.7/share/doc/Macaulay2" + helpPath;
        console.log(helpPath);
        clients[clientID].socket.emit("viewHelp", helpPath);
    };

    var isViewHelpEvent = function (eventData) {
        return eventData.match(/^file:.*/);
    };

    var emitEventUrlToClient = function(clientID, eventType, data){
        if (isViewHelpEvent(eventType)) {
            emitHelpUrlToClient(clientID, eventType);
        } else {
            emitUrlForUserGeneratedFileToClient(clientID, eventType);
        }
        var outputData = data.replace(/>>SPECIAL_EVENT_START>>/,"opening ");
        outputData = outputData.replace(/<<SPECIAL_EVENT_END<</,"");
        clients[clientID].socket.emit('result', outputData);
    };

    var sendDataToClient = function (clientID) {
        return function (dataObject) {
            var data = dataObject.toString();
            var socket = clients[clientID].socket;
            if (!socket) {
                logClient(clientID, "Error, no socket for client.");
                return;
            }
            updateLastActiveTime(clientID);
            var specialEvent = captureSpecialEvent(data);
            if (specialEvent) {
                emitEventUrlToClient(clientID, specialEvent, data);
                return;
            }
            socket.emit('result', data);
        };
    };

    var attachListenersToOutput = function (clientID) {
        var client = clients[clientID];
        if (!client) {
            return;
        }
        if (client.mathProgramInstance) {
            clients[clientID].mathProgramInstance
                .removeAllListeners('data')
                .on('data', sendDataToClient(clientID));
        }
    };

    var stats = function (request, response) {
        // to do: authorization
        response.writeHead(200, {
            "Content-Type": "text/html"
        });
        var currentUsers = 0;
        for (var c in clients) {
            if (clients.hasOwnProperty(c))
                currentUsers = currentUsers + 1;
        }
        response.write(
            '<head><link rel="stylesheet" href="mathProgram.css" type="text/css" media="screen"></head>');
        response.write('<h1>' + options.MATH_PROGRAM + ' User Statistics</h1>');
        response.write('There are currently ' + currentUsers +
        ' users using ' + options.MATH_PROGRAM + '.<br>');
        response.write('In total, there were ' + totalUsers +
        ' users since the server started.<br>');
        response.write('Enjoy ' + options.MATH_PROGRAM + '!');
        response.end();
    };

    var updateLastActiveTime = function (clientID) {
        clients[clientID].lastActiveTime = Date.now();
    };

    var killMathProgram = function (stream, clientID) {
        logClient(clientID, "killMathProgramClient.");
        stream.close();
    };

    var resetRecentlyRestarted = function (client) {
        client.recentlyRestarted = true;
        setTimeout(function () {
            client.recentlyRestarted = false;
        }, 1000);
    };

    

    var checkCookie = function (request, response, next) {
        var cookies = new Cookies(request, response);
        var clientID = cookies.get(cookieName);
        if (!clientID) {
            console.log('New client without a cookie set came along');
            console.log('Set new cookie!');
            clientID = getNewClientID();
        }
        setCookie(cookies, clientID);

        if (!clients[clientID]) {
            clients[clientID] = new Client();
        }
        next();
    };

    var unhandled = function (request, response) {
        var url = require('url').parse(request.url).pathname;
        console.log("Request for something we don't serve: " + request.url);
        response.writeHead(404, "Request for something we don't serve.");
        response.write("404");
        response.end();
    };

    var initializeServer = function () {
        var favicon = require('serve-favicon');
        var serveStatic = require('serve-static');
        var winston = require('winston'),
            expressWinston = require('express-winston');

        var loggerSettings = {
            transports: [
                new winston.transports.Console({
                    level: 'error',
                    json: true,
                    colorize: true
                })
            ]
        };
        var prefix = "public-" + options.MATH_PROGRAM + "/";
        var tutorialReader = require('./tutorialReader.js')(prefix, fs);
        app.use(favicon(__dirname + '/../public-' + options.MATH_PROGRAM + '/favicon.ico'));
        app.use(SocketIOFileUpload.router);
        app.use(checkCookie);
        app.use(serveStatic(__dirname + '/../public-' + options.MATH_PROGRAM));
        app.use(serveStatic(__dirname + '/../public'));
        app.use(expressWinston.logger(loggerSettings));
        app.use('/admin', stats)
            .use('/getListOfTutorials', tutorialReader.getList)
            .use(unhandled);
    };

    var attachUploadListenerToSocket = function (clientId, socket) {
        var uploader = new SocketIOFileUpload();
        uploader.listen(socket);

        uploader.on("error", function (event) {
            console.log("Error in upload " + event);
        });

        uploader.on("start", function (event) {
            clients[clientId].fileUploadBuffer = "";
            console.log('File upload ' + event.file.name);
        });

        uploader.on("progress", function (event) {
            // TODO: Limit size.
            clients[clientId].fileUploadBuffer += event.buffer;
        });

        uploader.on("complete", completeFileUpload(clientId));
    };

    var completeFileUpload = function (clientId) {
        return function (event) {
            var connection = ssh2();

            connection.on('end', function () {
            });

            connection.on('ready', function () {
                connection.sftp(function (err, sftp) {
                    var stream = sftp.createWriteStream(event.file.name);
                    stream.write(clients[clientId].fileUploadBuffer.toString());
                    stream.end(function () {
                        connection.end();
                    });
                    clients[clientId].fileUploadBuffer = "";
                });
            });

            connection.connect(
                {
                    host: clients[clientId].credentials.host,
                    port: clients[clientId].credentials.port,
                    username: clients[clientId].credentials.username,
                    privateKey: fs.readFileSync(clients[clientId].credentials.sshKey)
                }
            );

        };
    };

    var socketSanityCheck = function (clientId, socket) {
        if (!clients[clientId]) {
            clients[clientId] = new Client();
            clients[clientId].clientID = clientId;
        }
        clients[clientId].socket = socket;

        if (!clients[clientId].mathProgramInstance) {
            mathProgramStart(clientId);
        }
    };

    var listen = function () {
        var cookieParser = require('socket.io-cookie');
        io.use(cookieParser);
        io.on('connection', function (socket) {
            var cookies = socket.request.headers.cookie;
            var clientId = cookies[cookieName];
            socketSanityCheck(clientId, socket);
            attachUploadListenerToSocket(clientId, socket);
            socket.on('input', socketInputAction(clientId));
            socket.on('reset', socketResetAction(clientId));
        });
        return http.listen(options.port);
    };

    var checkStdinAndWrite = function(clientId, msg){
            var stdinIsDown = clients[clientId].mathProgramInstance._writableState.ended;
            if(stdinIsDown){
                mathProgramStart(clientId, function(){
                    checkStdinAndWrite(clientId, msg);
                });
            } else {
                clients[clientId].mathProgramInstance.stdin.write(msg, function (err) {
                    if (err) {
                        logClient(clientId, "write failed: " + err);
                    }
                });
            }
    };

    var socketInputAction = function (clientId) {
        return function (msg) {
            updateLastActiveTime(clientId);
            checkStdinAndWrite(clientId, msg);
        };
    };

    var socketResetAction = function (clientId) {
        return function () {
            console.log('Received reset.');
            var client = clients[clientId];
            if (client.recentlyRestarted) {
                console.log("Ignore repeated restart request");
                return;
            }
            if (client.mathProgramInstance) {
                killMathProgram(client.mathProgramInstance, clientId);
            }
            resetRecentlyRestarted(client);
            mathProgramStart(clientId);
        };
    };


    process.on('uncaughtException', function (err) {
        console.log('Caught exception in global process object: ' + err);
    });

    setInterval(pruneClients, options.PRUNE_CLIENT_INTERVAL);
    initializeServer();

    // These are the methods available from the outside:
    return {
        listen: listen,
        close: function () {
            http.close();
        }
    };
};

exports.MathServer = MathServer;
