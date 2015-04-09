var sudo_docker_manager = function () {
    var exec = require('child_process').exec;
   
    var resources = {
        cpus: 1,
        memory: 128
    };

    var options = {
        credentials: {
            host: '127.0.0.1',
            username: 'm2user',
            port: '123',
            sshKey: '/home/vagrant/InteractiveShell/id_rsa'
        }
    };




    var removeCredentials = function(credentials){
       exec('sudo docker rm -f m2Port' + credentials.port, function(error, stdout, stderr){
         console.log("Removed container with result: " + error);
       });
    };
   
    var getNewCredentials = function (next) {
      var exec = require('child_process').exec;
      var currentCredentials = JSON.parse(JSON.stringify(options.credentials));
      options.credentials.port++;
      var cmd = 'sudo docker run -d';
      cmd = cmd + ' -c ' + resources.cpus;
      cmd = cmd + ' -m ' + resources.memory;
      cmd = cmd + ' --name m2Port' + currentCredentials.port;
      cmd = cmd + ' -p ' + currentCredentials.port + ':22';
      cmd = cmd + ' m2container /usr/sbin/sshd -D';
      //console.log("Ports: " + currentCredentials.port + " " + options.credentials.port);
      exec(cmd, function (error, stdout, stderr) {
         console.log("Starting ssh.");
         next(currentCredentials);
      });
    };


    return {
        getNewCredentials : getNewCredentials,
        removeCredentials : removeCredentials
    };

};

exports.manager = sudo_docker_manager;
