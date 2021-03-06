var ssh2 = require('ssh2');
var fs = require('fs');

var sshDockerManager = function (overrideResources, overrideHostConfig, overrideGuestInstance) {

    var resources = {
        cpus: 1,
        memory: 128
    };

    var hostConfig = {
        minContainerAge: 10,
        maxContainerNumber: 1,
        containerType: 'm2container',
        sshdCmd: "/usr/sbin/sshd -D",
        dockerRunCmd: '',
        host: '192.168.2.42',
        username: 'vagrant',
        port: '22',
        sshKey: "/home/vagrant/InteractiveShell/separate_machines/host_key"
    };

    var currentContainers = [];

    var guestInstance = {
        host: '192.168.2.42',
        username: 'm2user',
        port: '5000',
        sshKey: '/home/vagrant/InteractiveShell/separate_machines/docker_key',
        containerName: '',
        lastActiveTime: 0
    };

    var overrideDefaultOptions = function (overrideOptions, defaultOptions) {
        for (var opt in overrideOptions) {
            if (defaultOptions.hasOwnProperty(opt)) {
                defaultOoptions[opt] = overrideOptions[opt];
                logExceptOnTest("server option: " + opt + " set to " + defaultOptions[opt]);
            }
        }
    };

    overrideDefaultOptions(overrideResources, resources);
    overrideDefaultOptions(overrideHostConfig, hostConfig);
    overrideDefaultOptions(overrideGuestInstance, guestInstance);

    function init() {
        hostConfig.dockerRunCmd = 'sudo docker run -d';
        hostConfig.dockerRunCmd += ' -c ' + resources.cpus;
        hostConfig.dockerRunCmd += ' -m ' + resources.memory + 'm';
        hostConfig.dockerRunCmd += ' --name';
    }

    init();

    var getDockerStartCmd = function (instance) {
        var result = hostConfig.dockerRunCmd;
        result += ' ' + instance.containerName;
        result += ' -p ' + instance.port + ":22";
        result += ' ' + hostConfig.containerType + " " + hostConfig.sshdCmd;
        return result;
    };

    var removeInstance = function (instance, next) {
        console.log("Removing container: " + instance.containerName);
        if (instance.killNotify) {
            instance.killNotify();
        }
        var removalCommand = "sudo docker rm -f " + instance.containerName;
        connectToHostAndExecCmd(removalCommand, function (stream) {
            stream.on('data', function (dataObject) {
            });
            stream.stderr.on('data', function (dataObject) {
            });
            removeInstanceFromArray(instance);
            if (next) {
                next();
            }
        });
    };

    var addInstanceToArray = function (instance) {
        currentContainers.push(instance);
    };

    var removeInstanceFromArray = function (instance) {
        var position = currentContainers.indexOf(instance);
        currentContainers.splice(position, 1);
    };

    var isLegal = function (instance) {
        var age = Date.now() - instance.lastActiveTime;
        return age > hostConfig.minContainerAge;
    };

    var killOldestContainer = function (next) {
        sortInstancesByAge();
        if (isLegal(currentContainers[0])) {
            removeInstance(currentContainers[0], function () {
                getNewInstance(next);
            });
        } else {
            throw "Too many active users.";
        }
    };

    var getNewInstance = function (next) {
        if (currentContainers.length >= hostConfig.maxContainerNumber) {
            killOldestContainer(next);
        } else {
            var currentInstance = JSON.parse(JSON.stringify(guestInstance));
            guestInstance.port++;
            currentInstance.containerName = "m2Port" + currentInstance.port;
            connectWithSshAndCreateContainer(currentInstance, next);
        }
    };

    process.on('uncaughtException', function (err) {
        console.error('Caught exception in cm process object: ' + err);
    });

    var connectWithSshAndCreateContainer = function (instance, next) {
        var dockerRunCmd = getDockerStartCmd(instance);
        connectToHostAndExecCmd(dockerRunCmd, function (stream) {
            stream.on('data', function (dataObject) {
                instance.containerId = dataObject.toString();
                checkForSuccessfulContainerStart(instance, next);
            });

            stream.stderr.on('data', function (dataObject) {
                // If we get stderr, there will not come an id, so don't be
                // afraid of data.
                var data = dataObject.toString();
                if (data.match(/ERROR/i)) {
                    getNewInstance(next);
                    stream.end();
                }
            });
        }, next);
    };

    var connectToHostAndExecCmd = function (cmd, next, errorHandler) {
        var connection = new ssh2.Client();
        connection.on('ready', function () {
            connection.exec(cmd, function (err, stream) {
                if (err) {
                    throw err;
                }
                stream.on('close', function () {
                    connection.end();
                });
                stream.on('end', function () {
                    stream.close();
                    // console.log('I ended.');
                    connection.end();
                });
                stream.on('Error', function (err) {
                    console.log("Error in stream: " + err);
                });
                next(stream);
            });
        }).on('error', function (error) {
            console.log("Error while sshing: " + error + "\nTried to do: " + cmd);
            if (errorHandler) {
                errorHandler(error);
            }
        }).connect({
            host: hostConfig.host,
            port: hostConfig.port,
            username: hostConfig.username,
            privateKey: fs.readFileSync(hostConfig.sshKey)
        });
    };

    var checkForSuccessfulContainerStart = function (instance, next) {
        var getListOfAllContainers = 'sudo docker ps --no-trunc | grep ' + instance.containerName + ' | wc -l';
        connectToHostAndExecCmd(getListOfAllContainers, function (stream) {
            stream.on('data', function (dataObject) {
                var data = dataObject.toString();
                if (data == 0) {
                    getNewInstance(next);
                } else {
                    checkForRunningSshd(instance, next);
                }
            });

            stream.stderr.on('data', function (dataObject) {
            });
        }, next);
    };

    var checkForRunningSshd = function (instance, next) {
        var getContainerProcesses = "sudo docker exec " + instance.containerName + " ps aux"
        var filterForSshd = "grep \"" + hostConfig.sshdCmd + "\"";
        var excludeGrepAndWc = "grep -v grep | wc -l";
        var sshdCheckCmd = getContainerProcesses + " | " + filterForSshd + " | " + excludeGrepAndWc;
        connectToHostAndExecCmd(sshdCheckCmd, function (stream) {
            stream.on('data', function (dataObject) {
                var data = dataObject.toString();
                if (data == 0) {
                    checkForRunningSshd(instance, next);
                } else {
                    instance.lastActiveTime = Date.now();
                    addInstanceToArray(instance);
                    next(null, instance);
                }
            });

            stream.stderr.on('data', function (dataObject) {
            });
        }, next);
    };

    var sortInstancesByAge = function () {
        currentContainers.sort(function (a, b) {
            return a.lastActiveTime - b.lastActiveTime;
        });
    };

    var updateLastActiveTime = function (instance) {
        instance.lastActiveTime = Date.now();
    };

    return {
        getNewInstance: getNewInstance,
        removeInstance: removeInstance,
        updateLastActiveTime: updateLastActiveTime
    };
};

exports.manager = sshDockerManager;
