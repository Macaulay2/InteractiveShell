// September 2012, Franziska Hinkelmann, Mike Stillman, and Lars Kastner
//
// This is server-side JavaScript, intended to be run with Node.js.
// This file defines a Node.js server for serving 'tryM2'.
//   run 
//      node m2server.js
// in a terminal in this directory.
// Then in a browser, use: 
//      http://localhost:8000/
// Required Node.js libraries: cookies.  Install via:
//   npm install cookies, or sudo npm install -g cookies
// Required on path: M2
// We are using our own open script to make Graphs.m2 work (generate jpegs for users), please include the current directory in your path: 
// export PATH=.:$PATH

// intended to run on (s)chrooted environment, where every user starts M2 in a separate schroot. 
//
// A message on / : possibly creates a cookie, and serves back index.html
//   and related js/css/png files
// A POST message on /chat: input should be Macaulay2 commands to perform.
// A message on /chat: start an event emitter, which will return the output of
// the M2 process.

var port = 8002; 
var sandboxDir = "/";

var http = require('http') 
    , connect = require('connect')
    , Cookies = require('cookies');
    
var SCHROOT = false; // start with --schroot on server
    
// The HTML file for the chat client. Used below.
//var clientui = require('fs').readFileSync("index.html");
var totalUsers = 0;

// An array of Client objects.  Each has an M2 process, and a response object
// It is possible that this.m2 is not defined, and/or that this.eventStream is not
// defined.
var clients = {};

function runShellCommand(cmd, callbackFcn) {
    // runs a command, and calls the callbackFnc with the output from stdout
    
    require('child_process').exec( cmd, function(error, stdout, stderr) {
        //console.log("runShellCommand result:" + stdout);
        callbackFcn(stdout);
    }); 
}

function Client(m2process, resp) {
    this.m2 = m2process;
    this.eventStream = resp;
    this.clientID = null;
}

startUser = function(cookies, callbackFcn) {
    totalUsers = totalUsers + 1;
    var clientID = Math.random()*1000000;
    clientID = Math.floor(clientID);
    clientID = "user" + clientID.toString(10);
    cookies.set( "tryM2", clientID, { httpOnly: false } );
    clients[clientID] = new Client(); 
    clients[clientID].clientID = clientID;
    if (SCHROOT) {
	console.log("Spawning new schroot process named " + clientID + ".");
	require('child_process').exec('schroot -c clone -n '+ clientID + ' -b', function() {
            var filename = "/var/lib/schroot/mount/" + clientID + "/home/franzi/sName.txt";
            // create a file inside schroot directory to allow schroot know its own name
            require('fs').writeFile(filename, clientID, function(err) {
                if(err) {
                    console.log("failing to write the file " + filename);
                    console.log(err);
                } else {
                    console.log("wrote schroot's name into " + filename);
    		    callbackFcn(clientID);
                }
	    });
	});
    } else {
	callbackFcn(clientID);
    }
    return clientID;
}

m2Start = function(clientID) {
    var spawn = require('child_process').spawn;
    if (SCHROOT) {
	    var m2 = require('child_process').spawn( 'schroot', ['-c', clientID, '-u', 'franzi', '-d', '/home/franzi/', '-r', '/M2/bin/M2']);
    } else {
        m2 = spawn('M2');
        console.log("Spawning new M2 process...");
    }
    m2.stdout.setEncoding("utf8");
    m2.stderr.setEncoding("utf8");
    return m2;
}

m2ConnectStream = function(clientID) {
     var client = clients[clientID];
     var ondata = function(data) {
         console.log('ondata: ' + data);
         message = 'data: ' + data.replace(/\n/g, '\ndata: ') + "\r\n\r\n";
         if (!client.eventStream) { // fatal error, should not happen
             console.log("Error: No event stream in Start M2");
             throw "Error: No client.eventStream in Start M2";
         }
         client.eventStream.write(message);           
     };
     console.log("Bind stdout to client's m2");
     client.m2.stdout.removeAllListeners('data');
     client.m2.stderr.removeAllListeners('data');
     client.m2.stdout.on('data', ondata);
     client.m2.stderr.on('data', ondata);
};

m2AssureRunning = function(clientID) {
    // clientID: name of the desired client
    // Caveat: It is possible to kill m2 after being being assured that it is
    //   there, so there is a possibility for a problem here.  We need to consider that? TODO

    var client = clients[clientID];
    if (!client.m2) {
        client.m2 = m2Start(clientID);
	    m2ConnectStream(clientID);
    }
};

assureClient = function(request, response, callbackFcn) {
    var cookies = new Cookies(request, response);
    var clientID = cookies.get("tryM2");
    //console.log("Client has cookie value: " + clientID);

    // Start new user for users coming with invalid, i.e., old, cookie
    if (!clients[clientID]) {
        console.log("startUser");
        clientID = startUser(cookies, callbackFcn);
    } else {
	callbackFcn(clientID);
    }
};

var stats = function(request, response, next) {
    // to do: authorization
     response.writeHead(200, {"Content-Type": "text/html"});
     var currentUsers = 0;
     for( var c in clients) {
         if(clients.hasOwnProperty(c))
            currentUsers = currentUsers + 1;
     }
     response.write('<head><link rel="stylesheet" href="m2.css" type="text/css" media="screen"></head>' );
     response.write('<h1>Macaulay2 User Statistics</h1>');
     response.write("There are currently " + currentUsers + " users using M2.<br>" );
     response.write("In total, there were " + totalUsers + " users since the server started.<br>");
     response.write("Enjoy M2!");
     response.end();    
}

// Send a comment to the clients every 20 seconds so they don't 
// close the connection and then reconnect
setInterval(function() {
    for (var prop in clients) {
        if (clients.hasOwnProperty(prop) 
            && clients[prop]
            && clients[prop].eventStream) {
            clients[prop].eventStream.write(":ping\n");
        }
    }
}, 20000);

// Client starts eventStream to obtain M2 output and start M2
startSource = function( request, response) {
    assureClient(request, response, function (clientID) {
    	response.writeHead(200, {'Content-Type': "text/event-stream" });
    	if (!clients[clientID].eventStream) {
            clients[clientID].eventStream = response;
            m2AssureRunning(clientID);
            m2ConnectStream(clientID);
    	}
    	// If the client closes the connection, remove client from the list of active clients
    	request.connection.on("end", function() {
                console.log("close connection: clients[" + clientID + "]");
                clients[clientID].eventStream = null;
                response.end();
    	});
    });
};

chatAction = function( request, response) {
    assureClient(request, response, function (clientID) {
    	if (!checkForEventStream(clientID, response)) {return false};
    	request.setEncoding("utf8");
    	var body = "";
    	// When we get a chunk of data, add it to the body
    	request.on("data", function(chunk) { body += chunk; });
        
    	// Send input to M2 when we have received the complete body
    	request.on("end", function() { 
    	    m2ProcessInput(clientID, body, response);
    	});
    });
};

m2ProcessInput = function( clientID, body, response ) {
    // this starts m2 if needed, and when it is done, calls callback
    console.log("entered m2ProcessInput");
    m2AssureRunning(clientID);

    try {
	    console.log("M2 input: " + body);
	    clients[clientID].m2.stdin.write(body);
    }
        catch (err) {
    	console.log(err);
    	console.log("Internal error: nothing to write to?!");
    	throw ("Internal error: nothing to write to?!");
    	return;
    }
    response.writeHead(200);  
    response.end();
};

// kill signal is sent to schroot, which results in killing M2
restartAction = function(request, response) {
    assureClient(request, response, function(clientID) {
	if (!checkForEventStream(clientID, response)) {return false};
	var client = clients[clientID];
	console.log("received: /restart from " + clientID);
	if (client.m2) { 
        client.m2.kill(); 
        console.log("In restartAction, killed child process with PID " + client.m2.pid);
        client.m2 = null;
	}
	client.m2 = m2Start(clientID);
	m2ConnectStream(clientID);
	response.writeHead(200);  
	response.end();
    });
};

// SCHROOT: when using child.kill('SIGINT'), the signal is sent to schroot, where it is useless, instead, find actual PID of M2. 
interruptAction = function(request, response)  {
    assureClient(request, response, function (clientID) {
	    if (!checkForEventStream(clientID, response)) {return false};
    	console.log("received: /interrupt from " + clientID);
    	if (clients[clientID] && clients[clientID].m2) {
            var m2 = clients[clientID].m2;
            if (SCHROOT) {
    	        runShellCommand('pgrep -P ' + m2.pid, function(m2Pid) {
    		    	console.log("PID of M2 inside schroot: " + m2Pid);
    			    var cmd = 'kill -s INT ' + m2Pid;
    			    console.log( "cmd: " + cmd );
    			    runShellCommand(cmd, function(res) {
    				    console.log("SIGINT has been sent to M2 " + m2Pid + ".");
    			    });
    	        });
            } else {
                m2.kill('SIGINT');
            }
    	}
    	response.writeHead(200);  
    	response.end();
    });
};

// returning clientID for a given M2 pid
// This currently does not work when working inside a schroot, because pid is not the schroot's pid
findClientID = function(pid){
    //var pid1 = parseInt(pid,10);
    console.log("Searching for clientID whose M2 has PID " + pid);
    for (var prop in clients) {
        if (clients.hasOwnProperty(prop) && clients[prop] && clients[prop].m2) {
            if (pid == clients[prop].m2.pid) {
                console.log("We found the client! It is " + prop);
                if (clients[prop].eventStream) {
                    console.log("findClientID picked user with clientID " + prop);
                    return prop;
                } else {
                    throw ("Client " + clientID + " does not have an eventstream.");
                }
            }
        }
    }
    throw ("Did not find a client for PID " + pid);
}

// return PID extracted from pathname for image displaying
parseUrlForPid = function(url) {
    console.log(url);
    if (SCHROOT) {
        var pid = url.match(/^\/(user\d+)\//);
    } else {
        pid = url.match(/\/M2-(\d+)-/);
    }
    //console.log( pid );
    if (!pid) {
        console.log("error, didn't get PID in image url");
        throw ("Did not get PID in image url");
    }
    console.log("PID = " + pid[1]);
    return pid[1];
    //return parseInt(pid[1],10);
}

// return path to image
parseUrlForPath = function(url) {
    var imagePath = url.match(/^\/(user)?\d+\/(.*)/);
    console.log(imagePath);
    
    if (!imagePath) {
        throw("Did not get imagePath in image url");
    }
    console.log("imagePath = " + imagePath[2]);
    return imagePath[2];
}

// we get a /image from our open script
// imageAction finds the matching client by parsing the url, then sends the address of the image to the client's eventStream
imageAction = function(request, response, next) {
    var url = require('url').parse(request.url).pathname;
    response.writeHead(200);  
    response.end();
    
    try {
        var pid = parseUrlForPid(url);
        var path = parseUrlForPath(url); // a string
        if (SCHROOT) {
            var clientID = pid;
        } else {
            clientID = findClientID(pid);
        }
        
        console.log("ClientID = " + clientID);
        
        client = clients[clientID];
          if (!client) {
              console.log("oops, no client");
              return;
          }
          
          if (SCHROOT) {
              path = "/var/lib/schroot/mount/" + clientID + path
          }
          console.log('we got a request for an image: ' + path + ", for clientID " + clientID);
          // parse request for PID and path to image

          message = 'event: image\r\ndata: ' + path + "\r\n\r\n";
          if (!client.eventStream) { // fatal error, should not happen
              console.log("Error: No event stream in Start M2");
          }
          else {
              console.log("Sent image message: " + message);
              client.eventStream.write(message);           
          }
    }
    catch (err) {
        console.log("Received invalid /image request: " + err);
    }
  
};

function checkForEventStream(clientID, response) {
    if (!clients[clientID].eventStream ) {
      console.log("Send notEventSourceError back to user.");
      response.writeHead(200, {'notEventSourceError': 'No socket for client...' });
      response.end();
      return false;
   }
   return true;
}

function unhandled(request, response, next) {
    var url = require('url').parse(request.url).pathname;
    if (url == '/chat' || url == 'interrupt' || url == '/restart') {
        next();
        return;
    }
    console.log("User requested something we don't serve");
    console.log(request.url);
}

// when run in production, work with schroots, see startM2Process()
if( process.argv[2] && process.argv[2]=='--schroot') {
    console.log('Running with schroots.');
    SCHROOT=true;
};

function uploadM2Package(request, response, next) {
    console.log("start upload function");
    assureClient(request, response, function(clientID) {
    	console.log("received: /upload from " + clientID);
    	var formidable = require('formidable');
        var form = new formidable.IncomingForm;
	if (SCHROOT) {
	    var schrootPath = "/var/lib/schroot/mount/" + clientID + "/home/franzi/"; 
	    form.uploadDir = schrootPath;
	}
        form.parse(request, function(error, fields, files) {
            console.log(fields);
            console.log(files);
	    console.log("path=" + files.file.path + " filename = " + files.file.name);
	    if (SCHROOT) {
		var newpath = schrootPath;
	    } else {
		newpath = "/tmp/";
	    }
	    require('fs').renameSync(files.file.path, newpath + files.file.name);
	    response.writeHead(200, {"Content-Type": "text/html"});
            response.end('upload complete!');
	  });
    });
    
};


var app = connect()
    .use(connect.logger('dev'))
    .use(connect.favicon())
    .use(connect.static('public'))
    .use('/upload', uploadM2Package)
    .use('/var', connect.static('/var')) // M2 creates temporary files (like created by Graphs.m2) here on MacOS
    .use('/tmp', connect.static('/tmp')) // and here on Ubuntu
    .use('/admin', stats)
    .use('/image', imageAction)
    .use('/startSourceEvent', startSource)
    .use('/chat', chatAction)
    .use('/interrupt', interruptAction)
    .use('/restart', restartAction)
    .use(unhandled)
    ;
    //.use(connect.errorHandler());
console.log("Listening on port " + port + "...");
http.createServer(app).listen(port);

// Local Variables:                                                                                   // indent-tabs-mode: nil                                                                              // End:                                                                                                                                 
