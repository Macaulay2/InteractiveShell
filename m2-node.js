/*global $, SyntaxHighlighter, alert, clearTimeout, console, document, setTimeout, trym2, updateOrientation, window */


var trym2 = {
    offset: 0,
    waitingtime: 2500, // in ms.  Each time we poll for data and don't receive it, we wait longer.
    maxwaitingtime: 60 * 1000 * 10, // 10 minutes
    minwaitingtime: 100,
    lessonNr: 1,
    maxLesson: 1,
    timerobject: 0
};

trym2.scrollDown = function (area) {
    var mySize = $(area).val().length;
    $(area).scrollTop(mySize);
    return false;
    // Return false to cancel the default link action
};

/* get selected text, or current line, in the textarea #M2In */
trym2.getSelected = function (inputField) {
    var str = $(inputField).val(),
        start = $(inputField)[0].selectionStart,
        end = $(inputField)[0].selectionEnd,
        endPos;
    if (start === end) {
        // grab the current line
        start = 1 + str.lastIndexOf("\n", end - 1);
        endPos = str.indexOf("\n", start);
        if (endPos !== -1) {
            end = endPos;
        } else {
            end = str.length;
        }
    }
    return str.slice(start, end) + "\n";
};

// return false on error
trym2.sendToM2 = function (msg) {   
    var xhr = new XMLHttpRequest();           // Create a new XHR
    xhr.open("POST", "/chat");                // to POST to /chat.
    xhr.setRequestHeader("Content-Type",      // Specify plain UTF-8 text 
                         "text/plain;charset=UTF-8");
    xhr.send(msg);                            // Send the message
    
    return true;
};

trym2.sendOnEnterCallback = function (inputfield) {
    return function (e) {
        if (e.which === 13 && e.shiftKey) {
            e.preventDefault();
            // do not make a line break or remove selected text when sending
            trym2.sendToM2(trym2.getSelected(inputfield));
        }
    };
};



trym2.showTerminal = function () {
    $("#lesson").hide();
    $("#inputarea").show();
    $("#send").show();
    $("#pageIndex").hide();
    $("#previous").hide();
    $("#next").hide();
    $("#showLesson").show();
    $("#terminal").hide();
    
};

trym2.loadLesson = function (ell) {
    $("#inputarea").hide();
    var lessonContent = $('[lessonid="' + ell + '"]').html();
    $("#send").hide();
    $("#previous").show();
    $("#next").show();
    $("#pageIndex").text(trym2.lessonNr + "/" + trym2.maxLesson).show();
    $("#lesson").html(lessonContent).show();
    $("#showLesson").hide();
    $("#terminal").show();
};

trym2.switchLesson = function (incr) {
    //console.log("Current lessonNr " + trym2.lessonNr);
    //console.log("maxlesson " + trym2.maxLesson);
    trym2.lessonNr = trym2.lessonNr + incr;
    if (trym2.lessonNr >= 1 && trym2.lessonNr <= trym2.maxLesson) {
        //console.log("Switch lesson");
        trym2.loadLesson(trym2.lessonNr);
        $("#lesson").scrollTop(0);
    } else {
        trym2.lessonNr = trym2.lessonNr - incr;
        //alert("lesson with " + trym2.lessonNr + "." + incr + " not available");
    }
    
};

trym2.resetCallback = function () {
    var xhr = new XMLHttpRequest();           // Create a new XHR
    xhr.open("POST", "/restart");                // to POST to /chat.
    xhr.setRequestHeader("Content-Type",      // Specify plain UTF-8 text 
                         "text/plain;charset=UTF-8");
    xhr.send();                            // Send the message
    
    return true;
};

trym2.interruptCallback = function () {
    var xhr = new XMLHttpRequest();           // Create a new XHR
    xhr.open("POST", "/interrupt");                // to POST to /chat.
    xhr.setRequestHeader("Content-Type",      // Specify plain UTF-8 text 
                         "text/plain;charset=UTF-8");
    xhr.send();                            // Send the message
    
    return true;
};

trym2.sendCallback = function (inputField) {
    return function () {
        var str = trym2.getSelected(inputField);
        trym2.sendToM2(str);
        return false;
    };
};

trym2.helpScreen = function () {
    console.log("Display Help.");
    $("#help-dialog").dialog('open');
};

// input: filename with tutorial content
// return a list of lessons title, each wrapped in a div and link, 
// <div><a>" + title + "</a></div>  
// attach a lesson ID
trym2.getLessonTitles = function (tutorialFile, callback) {
    var titles = "";
    $("#menuTutorial").load(tutorialFile, function () {
        var i = 1;
        $("#menuTutorial h4").each(function () {
            var title = $(this).text();
            titles = titles + "<div><a class='submenuItem' lessonid='lesson" + i + "'>" + title + "</a></div>";
            i = i + 1;
            //console.log("Title in m2.js: " + title);
        });
        //console.log("All titles: " + titles);
        callback(titles);
    });
};

$(document).ready(function () {
    // Register for notification of new messages using EventSource
    var chat = new EventSource("/chat");

    chat.onmessage = function(event) {            // When a new message arrives
        var msg = event.data;                     // Get text from event object
        //var node = document.createTextNode(msg);  // Make it into a text node
        //var div = document.createElement("div");  // Create a <div>
        //div.appendChild(node);                    // Add text node to div
        //document.body.insertBefore(div, input);   // And add div before input
        //input.scrollIntoView();                   // Ensure input elt is visible
        
        
        if (msg !== "") {
                //console.log("We got a chat message: " + msg);
                $("#M2Out").val($("#M2Out").val() + msg);
                trym2.scrollDown("#M2Out");
                
        }
    }
    
    
    $('.submenuItem').live("click", function () {
        var i = 1,
            lessonId = $(this).attr('lessonid');
        //console.log("You clicked a submenuItem: " + $(this).html());
        trym2.lessonNr = parseInt(lessonId.match(/\d/g), 10);
        $("#tutorial").html($("#menuTutorial").html());
        $("#tutorial h4").each(function () {
            $(this).parent().attr('lessonid', i); // add an ID to every lesson div
            i = i + 1;
        });
        trym2.maxLesson = i-1;
        trym2.loadLesson(trym2.lessonNr);
    });

    $('#help-dialog').dialog({
        height: 340,
        width: 460,
        modal: true,
        autoOpen: false
    });
    $('#help').click(trym2.helpScreen);

    SyntaxHighlighter.all();

    $('#M2In').keypress(trym2.sendOnEnterCallback('#M2In'));
    $("#send").click(trym2.sendCallback('#M2In'));
    $("#reset").click(trym2.resetCallback);
    $("#interrupt").click(trym2.interruptCallback);
    $("#terminal").click(trym2.showTerminal);
    $("#showLesson").click(function() {
        trym2.loadLesson(trym2.lessonNr);
        console.log("lesson!");
    });
  
        

    $("code").live("click", function () {
        $(this).effect("highlight", {color: 'red'}, 800);
        var code = $(this).text();
        code = code + "\n";
        $("#M2In").val($("#M2In").val() + code);
        trym2.scrollDown("#M2In");
        trym2.sendToM2(code);
    });

    $("#inputarea").hide();
    $("#send").hide();

    $("#pageIndex").hide();

    $("#tutorial").html("<div class='lesson' lessonid='1'><div><br>Get started by <b>selecting a tutorial</b> from the menu on the upper right corner or by using the Macaulay2 console. Have fun!<br>    <code>3+18</code><br>    <code>version</code><br>    <code> exit </code> <br>   <code> R = ZZ/101[vars(0..17)] </code> <br>   <code> gbTrace=1 </code> <br> <code> time res coker vars R </code> <br>  <code> m1 = genericMatrix(R,a,3,3) </code> <br> <code> m2 = genericMatrix(R,j,3,3) </code> <br> <code> J = ideal(m1*m2-m2*m1) </code> <br> <code> C = res J </code> <br> <code> C.dd_3 </code> <br></div></div>");
    trym2.loadLesson(trym2.lessonNr);
    trym2.maxLesson = $('#tutorial').children().length;
    console.log("maxLesson: " + trym2.maxLesson);

    $("#next").click(function () {
        trym2.switchLesson(1);
    });
    $("#previous").click(function () {
        trym2.switchLesson(-1);
    });
    
    $("#next").hide();
    $("#previous").hide();
    $("#showLesson").hide();

    // swipe changed to swipeXXX to remove functionality for testing
    $(function () {
        $("#leftwindow").bind("swipeXXX", function (event, info) {
            if (info.direction === "left") {
                trym2.switchLesson(1);
            } else if (info.direction === "right") {
                trym2.switchLesson(-1);
            } else {
                alert("swiped: huh?");
            }
        });
    });

    $(function () {
        $("#extruderTop").buildMbExtruder({
            position: "top",
            width: 350,
            extruderOpacity: 1,
            onExtOpen: function () {},
            onExtContentLoad: function () {},
            onExtClose: function () {}
        });
    });

    //updateOrientation();
});

function updateOrientation() {
    var orient = "";
    switch (window.orientation) {
    case 0:
    case 180:
        orient = "show_portrait";
        break;
    case -90:
    case 90:
        orient = "show_landscape";
        break;
    default:
        orient = "show_landscape";
    }
    $("body").attr("class", orient);
    $("#rightwindow").attr('class', orient);
    $("#leftwindow").attr('class', orient);
}
/* Info on selected text:
 * jquery plugin: jquery-fieldselection.js
 * example use: http://laboratorium.0xab.cd/jquery/fieldselection/0.1.0/test.html
 * DOM: selectionStart, selectionEnd
 *  stackoverflow: search for selectionStart
 */
