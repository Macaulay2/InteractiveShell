var assert = require("assert");
var http = require('http');
var m2 = require('../m2server-module.js');

describe('Array', function(){
  describe('#indexOf()', function(){
    it('should return -1 when the value is not present', function(){
      assert.equal(-1, [1,2,3].indexOf(5));
      assert.equal(-1, [1,2,3].indexOf(0));
    });
    it('should be true', function() {
        assert(true);
    }); 
  })
})

describe('assert.notEqual', function() {
    it('should make 1 not equal to null', function() {
        assert.notEqual(1, null);
    })
})


describe('m2server', function(){
    describe('basic behavior', function() {
        
        it('should be available as a variable', function(done){
            var server = m2.M2Server();
            assert.notEqual(server, null);
            //server.close();
            done();
        });
        it('should not listen without being started', function(done) {
            var http = require('http');
            http.get("http://localhost:8002/", function(res) {
                //console.log("status: " + res.statusCode);
                assert.notEqual(res.statusCode, 200);
            }).on('error', function(e) {
                //console.log("Got error: " + e.message);
                assert.equal(e.message, "connect ECONNREFUSED");
                done();
            });
        });
        it('should be able to create server and get title from html body', function(done){
            //var server = http.createServer(m2server.app);
            var server = m2.M2Server();
            server.listen(8002);
            http.get("http://localhost:8002/", function(res) {
                //console.log(res.statusCode);
                res.on('data', function(body) {
                     //console.log(body.toString('utf-8'));
                     var str = body.toString('utf-8'); 
                     var n = str.match(/<title>\s*([^\s]*)\s*<\/title>/); 
                     assert.equal(n[1], 'Macaulay2');
                     //console.log("The title is: " + n[1]);
                     server.close();
                     done();
                 });
            });
        });
        it('should close the server', function(done) {
            var server = m2.M2Server();
            server.listen(8002);
            server.close();
            var http = require('http');
            http.get("http://localhost:8002/", function(res) {
                assert.notEqual(res.statusCode, 200);
            }).on('error', function(e) {
                //console.log("Got error: " + e.message);
                assert.equal(e.message, "connect ECONNREFUSED");
                done();
            });
        });
    });
    /*describe('JS on M2 website', function() {
         it('should load content into lesson', function(done) {
             var fs = require('fs');
             var jsdom = require('jsdom');
             var doc   = jsdom.jsdom(fs.readFileSync("./public/index.html"), null, {
                       features: {
                         FetchExternalResources   : ['script'],
                         ProcessExternalResources : ['script'],
                         MutationEvents           : '2.0',
                     }
                 });
             var window = doc.createWindow(); 
             jsdom.jQueryify(window, function() {
                 //console.log(window.document.innerHTML);
                 var $ = window.jQuery;
                 var s = $("#lesson").text();
                 //console.log("Lesson:" + s + ":");
                 assert.notEqual(s, "");
                 assert(s.match(/^  Get started by selecting a tutorial or by using the Input Terminal. Have fun!  needsPacka/)); 
                 done();
             });
        });       
    });*/
    describe('advanced behavior', function() {
        it('should be running M2', function(){
            //assert(false);
        });
        it('should calculate 2+2', function() {
            //assert(false);
        });
    });
})

describe('jsdom', function(){
    it('should work with code from jsdom documentation', function(done){
        var jsdom = require('jsdom');

        jsdom.env({
          html: "<html><body></body></html>",
          scripts: [
            'http://code.jquery.com/jquery-1.5.min.js'
          ]
        }, function (err, window) {
          var $ = window.jQuery;

          $('body').append("<div class='testing'>Hello World</div>");
          //console.log($(".testing").text()); // outputs Hello World
          assert.equal($(".testing").text(), 'Hello World');
          done();
        });
    });
    it('should work with fs', function(done) {
        var fs = require('fs');
        var jsdom = require('jsdom');
        var doc   = jsdom.jsdom(fs.readFileSync("tests/test2.html"), null, {
                  features: {
                    FetchExternalResources   : ['script'],
                    ProcessExternalResources : ['script'],
                    MutationEvents           : '2.0',
                }
            });

        var window = doc.createWindow();
        jsdom.jQueryify(window, "http://code.jquery.com/jquery-1.5.min.js", function() {
            var $ = window.jQuery;
            var s = $("h1").text();
            //console.log(s);
            assert.equal(s, 'Before');
            done();
        });
    });
    it('should work with fs and javascript', function(done) {
          var fs = require('fs');
          var jsdom = require('jsdom');
          var doc   = jsdom.jsdom(fs.readFileSync("tests/test.html"), null, {
                    features: {
                      FetchExternalResources   : ['script'],
                      ProcessExternalResources : ['script'],
                      MutationEvents           : '2.0',
                  }
              });

          var window = doc.createWindow();
          jsdom.jQueryify(window, "http://code.jquery.com/jquery-1.5.min.js", function() {
              //console.log(window.$().jquery); //jquery version
              var $ = window.jQuery;
              assert.equal($("h1").text(), 'BeforeExternalAfter');
              done();
          });
    });
    it('should work on Lars code', function(done){
        var fs = require('fs');
        var jsdom = require('jsdom');
        var doc   = jsdom.jsdom(fs.readFileSync("./tests/test.html"), null, {
                  features: {
                    FetchExternalResources   : ['script'],
                    ProcessExternalResources : ['script'],
                    MutationEvents           : '2.0',
                }
            });
        var window = doc.createWindow();
        jsdom.jQueryify(window, function() {
            //console.log(window.document.innerHTML);
            var $ = window.jQuery;
            assert.equal($("h1").text(), 'BeforeExternalAfter');
            done();
        });
    });
})

describe('regexsearch', function(){
    it('should find text between title tags', function() {
        var s = 'bla <title> blubb </title> blobber';
        var n = s.match(/<title>\s*([^\s]*)\s*<\/title>/); 
        //console.log(n);
        assert.equal(n[1], 'blubb');
        s = 'bla <title> blubb\n </title> blobber';
        var n = s.match(/<title>\s*([^\s]*)\s*<\/title>/); 
        assert.equal(n[1], 'blubb');
    });
    it('should find beginning of string', function() {
       var s = "hello world";
       assert(s.match(/^hello/)); 
       assert(!false);
       assert(!s.match(/^Hello/)); 
    });
    it('should find the path', function(){
        var url = "/M2-2812-0/blablubb";
        var imagePath = url.match(/^\/(user)?\d+\/(.*)/); 
        console.log(imagePath);
        url = "/2812/abunchofstuff/M2-2812-0/blablubb";
        imagePath = url.match(/^\/(user)?\d+\/(.*)/); 
        assert.equal(imagePath[2], "abunchofstuff/M2-2812-0/blablubb");
    });
})

describe('testserver', function() {
    var server;
    before(function(done) {
        var http = require('http');
        server = http.createServer(function (req, res) {
          res.writeHead(200, {'Content-Type': 'text/plain'});
          res.end('Hello World\n');
        }).listen(1337, '127.0.0.1');
        console.log('Server running at http://127.0.0.1:1337/');
        
        server.on("listening", function() {
            console.log("started");
            done();
        });
    });
    it("Should fetch /", function(done) {
        http.get("http://localhost:1337/", function(res) {
            assert.equal(res.statusCode, 200);
            done();
        });
    });
    it("Should fetch Hello World", function(done) {
        http.get("http://localhost:1337/", function(res) {
            res.on('data', function(body) {
                //console.log(body);
                assert.equal(body, "Hello World\n");
                done();
            });
        });
    });
        
    after(function(done){
      server.close();
      console.log("stopped");
      done();
    });
});



