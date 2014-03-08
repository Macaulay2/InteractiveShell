// March 2014, Franziska Hinkelmann, Mike Stillman, and Lars Kastner
//
// This file defines a Node.js server for serving 'tryMathProgram', where Math Program is set in options.
//   run 
//       node m2server.js 
//   or
//       node m2server-schroot.js
// in a terminal in this directory. Alternatively you can use the Makefile 
// provided alongside this repository.
//
//
// Local version:
//
// In a browser, use: 
//      http://localhost:8002/
// Install node requirements via:
//   npm install
// Required on path: math program such as Singular or Macaulay2
//
//
// A message on / : possibly creates a cookie, and serves back index.html and
// related js/css/png files
// A POST message on /chat: input should be a math program commands to perform.  A
// message on /chat: start an event emitter, which will return the output of
// the math program process.
// Image is being called by the open script to tell the server where to find a
// jpg that the user created
//
// Using Node connect, but not express

var http = require('http'),
    fs = require('fs'),
    connect = require('connect'),
    Cookies = require('cookies');


var M2Server = function (overrideOptions) {
    var options = {
            port: 8002, // default port number to use
            PRUNE_CLIENT_INTERVAL: 1000 * 60 * 10, // 10 minutes
            MAXAGE: 1000 * 60 * 60 * 24 * 7, // 1 week
            SECURE_CONTAINERS: false, // if true: start with 'sudo make start' on server.
            SSH_KEY_PATH: "/home/admin/.ssh/singular_key",
            SFTP_KEY_PATH: "/home/admin/.ssh/sftp_key",
            MATH_PROGRAM: "Singular"
        };

    var cookieName = "try" + options.MATH_PROGRAM;

    var totalUsers = 0; //only used for stats: total # users since server started

    // An array of Client objects.  Each has an M2 process, and a response
    // object It is possible that this.m2 is not defined, and/or that
    // this.eventStreams is not defined.
    var    clients = {};
    var   server;

    var lxc = require('./lxc_manager.js');
    var ipCollection = lxc.lxc_manager();

    // preamble every log with the client ID
    var logClient = function (clientID, str) {
        console.log(clientID + ": " + str);
    };


    var deleteClient = function (clientID) {
        ipCollection.removeIp(clients[clientID].ip);
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
                console.log("lastActiveTime for user : " + clientID + " " +
                    clients[clientID].lastActiveTime);
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

    // deciding that a user is obsolete: 
    // set clients[clientID].timestamp (set by M2 output or the client's input)
    // in set time intervals, iterate over clients and if timestamp is too old
    // or using too high resources, delete the client
    var pruneClients = function () {
        // run this when using schroot.
        // this loops through all clients, and checks their timestamp, also, it
        // checks their resource usage with a perl script. Remove old or bad
        // clients
        console.log("Pruning clients...");
        var minimalLastActiveTimeForClient = timeBeforeInterval(options.MAXAGE);
        removeOldClients(minimalLastActiveTimeForClient);
        console.log("Done pruning clients...  Continuing clients:");
        logCurrentlyActiveClients();
    };

    // runs a command, and calls the callbackFnc with the output from stdout
    var runShellCommand = function (cmd, callback) {
        console.log("Run shell command: " + cmd);
        require('child_process').exec(cmd, function (error, stdout) {
            callback(stdout);
        });
    };

    var Client = function () {
        this.eventStreams = [];
        // generated randomly in startUser(), used for cookie and as user name
        // on the system
        this.recentlyRestarted = false;
        // we use this to keep from handling a bullet stream of restarts
        this.lastActiveTime = Date.now(); // milliseconds when client was last active
        this.ip = 0;
    };


    // returns true if clients[clientID] exists
    // clientID is of the form user12345
    var clientIDExists = function (clientID) {
        if (clients[clientID] == null) {
            return false;
        }
        logClient(clientID, "Client already exists");
        return true;
    };

    var getNewClientID = function () {
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

    var startUser = function (cookies, request, callbackFcn) {
        totalUsers = totalUsers + 1;
        var clientID = getNewClientID();
        setCookie(cookies, clientID);
        clients[clientID] = new Client();
        clients[clientID].clientID = clientID;

        logClient(clientID,
            "New user: " + " UserAgent=" + request.headers['user-agent'] + ".");
        logClient(clientID, "secure_containers option: " + options.SECURE_CONTAINERS);
        callbackFcn(clientID);
    };

    var getIp = function (clientID, next) {
        var ip = clients[clientID].ip;
        logClient(clientID, "Want to get ip. " + ip);
        if(ip == 0){
            ipCollection.getNewIp(next)
        } else {
            next(ip);
        }
    };

    var escapeSpacesForSpawnCommand = function (cmd) {
        return cmd.replace(/ /g, "\ ");
    };

    var spawnMathProgramInSecureContainer = function (clientID, next) {
        getIp(clientID, function(ip) {
            logClient(clientID, "In spawn, have ip: " + ip);
            var spawn = require('child_process').spawn;
            var sshCommand = "ssh -oStrictHostKeyChecking=no -i " + options.SSH_KEY_PATH + " " + ip;
            var args = [ "-c", escapeSpacesForSpawnCommand(sshCommand)];
            logClient(clientID, args.join(" "));
            var process = spawn('script', args);

            next(process);
        });
    };

    var removeListenersFromPipe = function (clientID) {
        return function (returnCode, signal) {
            logClient(clientID, "M2 exited.");
            logClient(clientID, "returnCode: " + returnCode);
            logClient(clientID, "signal: " + signal);
            this.stdout.removeAllListeners('data');
            this.stderr.removeAllListeners('data');
        };
    };

    var setPipeEncoding = function (process, encoding) {
        process.stdout.setEncoding(encoding);
        process.stderr.setEncoding(encoding);
    };

    var setMathProgramProcess = function (process, clientID) {
        process.on('exit', removeListenersFromPipe(clientID));
        setPipeEncoding(process, "utf8");
        clients[clientID].m2 = process;
        attachListenersToOutput(clientID);
    };

    var mathProgramStart = function (clientID) {
        var spawn = require('child_process').spawn;
        logClient(clientID, "Spawning new " + options.MATH_PROGRAM+ " process...");
        if (options.SECURE_CONTAINERS) {
            spawnMathProgramInSecureContainer(clientID, function(process){
                setMathProgramProcess(process, clientID);
            });
        } else {
            var process = spawn('script', ['/dev/null', options.MATH_PROGRAM]);
            setMathProgramProcess(process, clientID);
        }
    };

    var formatServerSentEventMessage = function (data) {
        data.replace(/\n$/, "");
        return 'data: ' + data.replace(/\n/g, '\ndata: ') + "\r\n\r\n";

    };

    var sendDataToClient = function (clientID) {
        return function (data) {
            var streams = clients[clientID].eventStreams;
            updateLastActiveTime(clientID);
            var message = formatServerSentEventMessage(data);
            if (!streams || streams.length == 0) { // fatal error, should not happen
                logClient(clientID, "Error: No event stream for sending data to client.");
                return;
            }

            for (var stream in streams) {
                logClient(clientID, "write data from stdout and stderr: " + message);
                streams[stream].write(message);
            }
        };
    };

    var attachListenersToOutputPipes = function (clientID) {
        var mathProgramProcess = clients[clientID].m2;
        mathProgramProcess.stdout.removeAllListeners('data');
        mathProgramProcess.stderr.removeAllListeners('data');
        mathProgramProcess.stdout.on('data', sendDataToClient(clientID));
        mathProgramProcess.stderr.on('data', sendDataToClient(clientID));
    };

    var attachListenersToOutput = function (clientID) {
        var client = clients[clientID];
        if (!client) return;
        if (client.m2) {
            attachListenersToOutputPipes(clientID);
        }
    };

    var runFunctionIfClientExists = function (next) {
        return function (request, response) {
            var cookies = new Cookies(request, response);
            var clientID = cookies.get(cookieName);
            console.log("Client has cookie value: " + clientID);
            if (!clients[clientID]) {
                startUser(cookies, request, next(request, response));
            } else {
                next(request, response)(clientID);
            }
        };
    };

    var stats = function (request, response) {
        // todo: authorization
        response.writeHead(200, {
            "Content-Type": "text/html"
        });
        var currentUsers = 0;
        for (var c in clients) {
            if (clients.hasOwnProperty(c))
                currentUsers = currentUsers + 1;
        }
        response.write(
            '<head><link rel="stylesheet" href="m2.css" type="text/css" media="screen"></head>');
        response.write('<h1>Singular User Statistics</h1>');
        response.write("There are currently " + currentUsers +
            " users using Singular.<br>");
        response.write("In total, there were " + totalUsers +
            " users since the server started.<br>");
        response.write("Enjoy Singular!");
        response.end();
    };

    var keepEventStreamsAlive = function () {
        for (var prop in clients) {
            if (clients.hasOwnProperty(prop)) {
                var client = clients[prop];
                if (client && client.eventStreams) {
                    for (var stream in client.eventStreams) {
                        if (client.eventStreams.hasOwnProperty(stream)) {
                            client.eventStreams[stream].write(":ping\n");
                        }
                    }
                }
            }
        }
    };

    var setEventStreamForClientID = function (clientID, stream) {
        logClient(clientID, "pushing a response");
        clients[clientID].eventStreams.push(stream);
    };

    // Client starts eventStreams to obtain math program output and start math program
    var connectEventStreamToMathProgramOutput = function (request, response) {
        return function (clientID) {
            logClient(clientID, "connectEventStreamToMathProgramOutput");
            response.writeHead(200, {
                'Content-Type': "text/event-stream"
            });
            setEventStreamForClientID(clientID, response);

            if (!clients[clientID].m2) {
                mathProgramStart(clientID);
            }
            attachListenersToOutput(clientID);

            // If the client closes the connection, remove client from the list of active clients
            request.connection.on("end", function () {
                logClient(clientID, "event stream closed");
                response.end();
            });
        };
    };

    var mathProgramInputAction = function (request, response) {
        return function (clientID) {
            logClient(clientID, "mathProgramInputAction");
            if (!checkForEventStream(clientID, response)) {
                return;
            }
            request.setEncoding("utf8");
            var mathProgramCommands = "";
            // When we get a chunk of data, add it to the command
            request.on("data", function (chunk) {
                mathProgramCommands += chunk;
            });

            // Send input to math program when we have received the complete command
            request.on("end", function () {
                handCommandsToMathProgram(clientID, mathProgramCommands, response);
            });
        };
    };

    var updateLastActiveTime = function (clientID) {
        clients[clientID].lastActiveTime = Date.now();
    };

    var handCommandsToMathProgram = function (clientID, mathProgramCommands, response) {
        logClient(clientID, options.MATH_PROGRAM + " input: " + mathProgramCommands);
        if (!clients[clientID] || !clients[clientID].m2 || !clients[clientID].m2.stdin.writable) {
            // this user has been pruned out!  Simply return.
            response.writeHead(200);
            response.end();
            return;
        }
        updateLastActiveTime(clientID);
        try {
            clients[clientID].m2.stdin.write(mathProgramCommands, function (err) {
                if (err) {
                    logClient(clientID, "write failed: " + err);
                }
            });
        } catch (err) {
            logClient(clientID, err);
            // At this point, there was some problem writing to the math program process
            // we just return.
        }
        response.writeHead(200);
        response.end();
    };

    var ignoreRepeatedRestart = function () {
        console.log("Ignore repeated restart request");
        response.writeHead(200);
        response.end();
    };


    var killMathProgram = function (mathProgramProcess, clientID) {
        logClient(clientID, "killMathProgramClient: " + mathProgramProcess.pid);
        mathProgramProcess.kill();
        mathProgramProcess.stdin.end();
        if (options.SECURE_CONTAINERS) {
            runShellCommand("killall -u " + clients[clientID].systemUserName, function (ret) {
                console.log(
                    "We removed processes associates to " + clientID + " with result: " + ret);
            });
        }
    };

    var resetRecentlyRestarted = function (client) {
        client.recentlyRestarted = true;
        setTimeout(function () {
            client.recentlyRestarted = false;
        }, 1000);
    };

    var restartAction = function (request, response) {
        return function (clientID) {
            logClient(clientID, "received: /restart");
            if (!checkForEventStream(clientID, response)) {
                return;
            }

            var client = clients[clientID];

            if (client.recentlyRestarted) {
                ignoreRepeatedRestart(client);
                return;
            }

            if (client.m2) {
                killMathProgram(client.m2, clientID);
            }

            resetRecentlyRestarted(client);

            mathProgramStart(clientID);
            response.writeHead(200);
            response.end();
        };
    };

    var interruptAction = function (request, response) {
        return function (clientID) {
            logClient(clientID, "received: /interrupt");
            if (!checkForEventStream(clientID, response)) {
                return;
            }

            var client = clients[clientID];

            if (client && client.recentlyRestarted) {
                ignoreRepeatedRestart(client);
                return;
            }
            if (client && client.m2) {
                var mathProgram = client.m2;
                if (options.SECURE_CONTAINERS) {
                    sendInterruptToMathProgramProcess(mathProgram.pid);
                } else {
                    mathProgram.kill('SIGINT');
                }
            }
            response.writeHead(200);
            response.end();
        };
    };

    /* To find the actual MathProgram we have to dig a little deeper:
     The m2.pid is the PID of the cgexec command.
     Using pgrep we gets the child process(es).
     In this case there is only one, namely the schroot.
     The child of the schroot then is M2 which we want to interrupt.
     */
    var sendInterruptToMathProgramProcess = function (schrootPid) {
        runShellCommand('n=`pgrep -P ' + schrootPid + '`; n=`pgrep -P $n`; pgrep -P $n', function (mathProgramPid) {
            logClient(clientID, "PID of " + options.MATH_PROGRAM + " inside schroot: " + mathProgramPid);
            var cmd = 'kill -s INT ' + mathProgramPid;
            runShellCommand(cmd, function (res) {
            });
        });
    };

    // returning clientID for a given math program pid
    // This currently does not work when working inside a schroot, because pid
    // is not the schroot's pid
    var findClientID = function (pid) {
        //console.log("Searching for clientID whose M2 has PID " + pid);
        for (var prop in clients) {
            if (clients.hasOwnProperty(prop) && clients[prop] && clients[prop].m2) {
                if (pid == clients[prop].m2.pid) {
                    //console.log("We found the client! It is " + prop);
                    if (clients[prop].eventStreams.length != 0) {
                        //console.log("findClientID picked user with clientID " + prop);
                        return prop;
                    } else {
                        throw ("Client " + clientID + " does not have an eventStream.");
                    }
                }
            }
        }
        throw ("Did not find a client for PID " + pid);
    };

    var regexMatchingForClientID = function (url) {
        // The URL's in question look like:
        //  (schroot version): /user45345/var/a.jpg
        //  (non-schroot): /dfdff/dsdsffff/fdfdsd/M2-12345-1/a.jpg
        //     where 12345 is the pid of the M2 process.
        var clientID;
        var matchObject;
        if (options.SECURE_CONTAINERS) {
            // This needs to be changed. What we might get here is only
            // the username. We need to match the clientID from this.
            matchObject = url.match(/^\/(user\d+)\//);
        } else {
            matchObject = url.match(/\/M2-(\d+)-/);
        }
        if (!matchObject) {
            console.log("error, could not find clientID from url");
            throw ("could not find clientID from url");
        }
        if (options.SECURE_CONTAINERS) {
            clientID = matchObject[1];
        } else {
            clientID = findClientID(matchObject[1]);
        }
        return clientID;
    };

    var getValidClientIDFromUrl = function (url) {
        var clientID = regexMatchingForClientID(url);
        // Sanity check:
        var client = clients[clientID];
        if (!client) {
            throw ("No client for ID: " + clientID);
        }
        return clientID;
    };

    var parseUrlForPath = function (clientID, url) {
        var path = url.replace(/^\/(user)?\d+\//, "");
        if (!path) {
            throw ("Could not extract path from " + url);
        }
        if (options.SECURE_CONTAINERS) {
            path = "/usr/local/var/lib/schroot/mount/" + clients[clientID].schrootName + path
        }
        return path;
    };

    var forwardRequestForSpecialEventToClient = function (eventType) {
        return function (request, response) {
            var url = require('url').parse(request.url).pathname;
            response.writeHead(200);
            response.end();
            try {
                var clientID = getValidClientIDFromUrl(url);
                logClient(clientID, "Request for " + eventType + " received: " + url);
                var path = parseUrlForPath(clientID, url); // a string
                message = 'event: ' + eventType + '\r\ndata: ' + path + "\r\n\r\n";
                sendMessageToClient(clientID, message);
            } catch (err) {
                logClient(clientID, "Received invalid request: " + err);
            }
        };
    };


    var sendMessageToClient = function (clientID, message) {
        var streams = clients[clientID].eventStreams;
        if (!streams || streams.length == 0) { // fatal error, should not happen
            logClient(clientID, "Error: No event stream");
        } else {
            for (var stream in streams) {
                streams[stream].write(message);
            }
        }
    };

    var checkForEventStream = function (clientID, response) {
        if (!clients[clientID].eventStreams || clients[clientID].eventStreams.length == 0) {
            logClient(clientID, "Send notEventSourceError back to user.");
            response.writeHead(200, {
                'notEventSourceError': 'No socket for client...'
            });
            response.end();
            return false;
        }
        return true;
    };

    var unhandled = function (request, response) {
        var url = require('url').parse(request.url).pathname;
        console.log("Request for something we don't serve: " + request.url);
        response.writeHead(404, "Request for something we don't serve.");
        response.write("404");
        response.end();
    };

    var setOwnershipToUser = function (clientID, filename) {
        runShellCommand("chown " + clients[clientID].systemUserName + ":" + clients[clientID].systemUserName + " "
            + filename, function (e) {
            console.log("Chown: " + e);
        });
    };


    var saveUploadedFile = function (temporaryFilename, filename, clientID, response) {
        return function () {
            console.log("end received from formidable form");
            fs.rename(temporaryFilename, filename, function (error) {
                if (error) {
                    logClient(clientID, "Error in renaming file: " + error);
                    response.writeHead(500, {
                        "Content-Type": "text/html"
                    });
                    response.end('rename failed: ' + error);
                } else {
                    if (options.SECURE_CONTAINERS) {
                        setOwnershipToUser(clientID, filename);
                    }
                    response.writeHead(200, {
                        "Content-Type": "text/html"
                    });
                    response.end('upload complete!');
                }
            });
        };
    };

    var sendUploadError = function (clientID) {
        return function () {
            logClient(clientID, 'received error in upload: ');
            response.writeHead(500, {
                "Content-Type": "text/html"
            });
            response.end('upload not complete!');
        };
    };


    var uploadFile = function (request, response) {
        return function (clientID) {
            logClient(clientID, "received: /uploadTutorial");
            var formidable = require('formidable');
            var form = new formidable.IncomingForm;
            var schrootPath;
            if (options.SECURE_CONTAINERS) {
                schrootPath = "/usr/local/var/lib/schroot/mount/" + clients[clientID].schrootName +
                    "/home/m2user/";
                form.uploadDir = schrootPath;
            }

            var filename;
            var temporaryFilename;

            form.on('file', function (name, file) {
                var path;
                if (options.SECURE_CONTAINERS) {
                    path = schrootPath;
                } else {
                    path = "/tmp/";
                }
                filename = path + file.name;
                temporaryFilename = file.path;
                form.on('end', saveUploadedFile(temporaryFilename, filename, clientID, response));

            });


            form.on('error', sendUploadError(clientID));

            form.parse(request);
        };
    };



    var saveAction = function (request, response) {
        return function (clientID) {
            request.setEncoding("utf8");
            logClient(clientID, "received: /save");
            // Set the directory where we will write the resulting 2 files
            var path = "/tmp/";
            if (options.SECURE_CONTAINERS) {
                path = "/usr/local/var/lib/schroot/mount/"
                    + clients[clientID].schrootName + "/home/m2user/";
            }
            var body = "";

            // When we get a chunk of data, add it to the body
            request.on("data", function (chunk) {
                body += chunk;
            });

            // grab input and output windows, place them in files where we can serve them
            request.on("end", function () {
                console.log("/save, received: " + body);
                var json = JSON.parse(body);
                console.log(json.input);

                fs.writeFile(path + options.MATH_PROGRAM + "-input", json.input);
                fs.writeFile(path + options.MATH_PROGRAM + "-output", json.output);
                response.writeHead(200, {
                    "Content-Type": "text/html"
                });
                var msg = {input: path + options.MATH_PROGRAM + "-input", output: path + options.MATH_PROGRAM + "-output"};
                response.write(JSON.stringify(msg));
                response.end();
            });
        };
    };

    var moveWelcomeTutorialToBeginning = function (tutorials, firstTutorial) {
        var index = tutorials.indexOf(firstTutorial);
        if (index > -1) {
            tutorials.splice(index, 1);
            tutorials.unshift(firstTutorial);
        }
        return tutorials;
    };

    var getListOfTutorials = function (request, response) {
        fs.readdir("public/tutorials/", function (err, files) {
            var tutorials = files.map(function (filename) {
                return "tutorials/" + filename;
            });
            console.log("Files: " + tutorials);
            response.writeHead(200, {
                "Content-Type": "text/html"
            });

            tutorials = moveWelcomeTutorialToBeginning(tutorials, "tutorials/welcome2.html");
            response.end(JSON.stringify(tutorials));
        });
    };

    var app = connect()
        .use(connect.logger('dev'))
        .use(connect.favicon())
        .use(connect.static('public'))
        .use('/admin', stats)
        .use('/upload', runFunctionIfClientExists(uploadFile))
        .use('/viewHelp', forwardRequestForSpecialEventToClient("viewHelp"))
        .use('/image', forwardRequestForSpecialEventToClient("image"))
        .use('/startSourceEvent', runFunctionIfClientExists(connectEventStreamToMathProgramOutput))
        .use('/chat', runFunctionIfClientExists(mathProgramInputAction))
        .use('/interrupt', runFunctionIfClientExists(interruptAction))
        .use('/restart', runFunctionIfClientExists(restartAction))
        .use('/save', runFunctionIfClientExists(saveAction))
        .use('/getListOfTutorials', getListOfTutorials)
        .use(unhandled);

    var initializeServer = function () {
        // when run in production, work with secure containers such as LXCs
        if (options.SECURE_CONTAINERS) {
            console.log('Running with secure containers.');
            setInterval(pruneClients, options.PRUNE_CLIENT_INTERVAL);
        }

        // Send a comment to the clients every 20 seconds so they don't 
        // close the connection and then reconnect
        setInterval(keepEventStreamsAlive, 20000);

        console.log("Starting " + options.MATH_PROGRAM + " server.");
        server = http.createServer(app);
    };

    var listen = function () {
        if (server === undefined) {
            initializeServer();
        }
        console.log(options.MATH_PROGRAM + " server listening on port " + options.port + "...");
        return server.listen(options.port);
    };

    var overrideDefaultOptions = function (overrideOptions) {
        // Start of Server creation code
        for (var opt in overrideOptions) {
            if (options.hasOwnProperty(opt)) {
                options[opt] = overrideOptions[opt];
                console.log("server option: " + opt + " set to " + options[opt]);
            }
        }
    };

    process.on('uncaughtException', function (err) {
        console.log('Caught exception in global process object: ' + err);
    });


    overrideDefaultOptions(overrideOptions);
    initializeServer();


    // These are the methods available from the outside:
    return {
        server: server,
        listen: listen,
        close: function () {
            server.close();
        }
    };
}; // end of def of M2Server

exports.M2Server = M2Server;
