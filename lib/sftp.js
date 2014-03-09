var Connection = require('ssh2');

var sftp = function(username) {
    var c = new Connection();
    var sftp_key = "/home/admin/.ssh/sftp_key";
    var ip;

    var connect = function(ipAddress) {
        ip = ipAddress;
    };

    var upload = function(tempFilename, filename, next) {
        console.log('connecting with username: ' + username);
        c.on('ready', function() {
            console.log('Connection :: ready');

            c.sftp(function(err, sftp) {
                if (err) throw err;

                sftp.fastPut(tempFilename, filename, function(err) {
                    if (err) {
                        console.log("upload of file failed. " + ip);
                        next(err);
                    } else {
                        console.log("upload of file succeeded: " + ip);
                        next();
                    }
                });

                sftp.on('error', function (error) {
                    console.log('error in SFTP. ' + error);
                    next(error);
                });

                sftp.on('end', function() {
                    console.log('SFTP :: SFTP session closed');
                });
            });
        });

        c.on('error', function(err) {
            console.log('Connection :: error :: ' + err);
        });

        c.on('end', function() {
            console.log('Connection :: end');
        });

        c.on('close', function() {
            console.log('Connection :: close');
        });

        c.connect({
            host: ip,
            port: 22,
            username: username,
            privateKey: require('fs').readFileSync(sftp_key)
        });
    };

    var download = function (filename, localFilename, next) {
        console.log('connecting with username: ' + username);
        c.on('ready', function() {
            console.log('Connection :: ready');

            c.sftp(function(err, sftp) {
                if (err) throw err;

                sftp.fastGet(filename, localFilename, function(err) {
                    if (err) {
                        console.log("download of file " + filename + " from " + ip + "failed.");
                        next(err);
                    } else {
                        console.log("download of file " + filename + " from " + ip + "succeeded.");
                        next();
                    }
                });

                sftp.on('error', function (error) {
                    console.log('error in SFTP. ' + error);
                    next(error);
                });

                sftp.on('end', function() {
                    console.log('SFTP :: SFTP session closed');
                });
            });
        });

        c.on('error', function(err) {
            console.log('Connection :: error :: ' + err);
        });

        c.on('end', function() {
            console.log('Connection :: end');
        });

        c.on('close', function() {
            console.log('Connection :: close');
        });

        c.connect({
            host: ip,
            port: 22,
            username: username,
            privateKey: require('fs').readFileSync(sftp_key)
        });

    };

    return {
        connect: connect,
        upload: upload,
        download: download
    }
};

exports.sftp = sftp;
