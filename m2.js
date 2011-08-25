var offset=0;
var waitingtime=2500; // in ms.  Each time we poll for data and don't receive it, we wait longer.
var maxwaitingtime=60*1000*10; // 10 minutes
var minwaitingtime=250;

var lessonNr = 1;
var maxLesson = 1;

var tutorial;
var timerobject;

$(document).ready(function() {
    checkForNewData(offset);

	$('[lessonid]').live('click', function(){
		var lessonId = $(this).attr('lessonid');
		lessonNr = parseInt( lessonId.match(/\d/g ));
		//alert("Lesson " + lessonNr);
		loadLesson(lessonNr);
	});
	
	$('#M2In').keypress(sendOnEnterCallback('#M2In'));
    $("#send").click(sendCallback( '#M2In' ));
    $("#reset").click(resetCallback);

    $("code").live("click", function() { 
	    var code = $(this).html();
		$("#M2In").val($("#M2In").val() + "\n" + code);
		scrollDown( "#M2In" );
		sendToM2(">>SENDCOMMANDS<<\n" + code);
	});
    $("#tutorial").hide();
    $("#inputarea").hide();
    $("#send").hide();
    $("#pageIndex").hide();
    
	$("#tutorial").load("tutorial.html", function () {
 		maxLesson = $('.lesson').children().length;
		// here we need to populate the menu on the home screen
		
		createMenu();
		
		
    	$('#lessonNr').html(lessonNr);
    	loadLesson(lessonNr);
  	});	
	
	
	$("#next").click( function(){
	    switchLesson(1);
	});
	$("#previous").click( function(){
	    switchLesson(-1);
	});

	$(function(){ $("#leftwindow").bind("swipe",function(event, info) {
        if (info.direction === "left"){
            switchLesson(1);
        } else if (info.direction === "right") {
            switchLesson(-1);
        } else {
            alert("swiped: huh?");
        }
        });
    });
});

function loadLesson(ell)
{
    if (ell == 0){
        $("#lesson").hide();
        $("#inputarea").show();
        $("#send").show();
        $("#pageIndex").hide();
        
    } else {
        $("#inputarea").hide();
        var selector = ".lesson ."+ell;
        var thehtml = $(selector).html();
        $("#send").hide();
        $("#pageIndex").text(lessonNr + "/" + maxLesson).show();
        $("#lesson").html(thehtml).show();
    }
}

function createMenu()
{
	var i = 1;
	$("#tutorial h4").each( function() {
		var title = $(this).text();
		//alert( title );
		$("#menu").append(
			"<li class='arrow'><a href='#M2' lessonid='lesson" + i +"'>Lesson " + i +": " + title + "</a></li>");
		// now create new menu item 
		//$('[lessonId]').text( "Lesson " + i + ": " + title );
		i = i + 1;
	} );

}
	
function switchLesson(incr)
{
    lessonNr = lessonNr + incr;
    if (lessonNr >= 0 && lessonNr <= maxLesson) {
        loadLesson(lessonNr);
    } else {
        lessonNr = lessonNr - incr;
        //alert("lesson with " + lessonNr + "." + incr + " not available");
    }
}

function checkForNewData()
{
	$.post("getResults.php", 'offset='+ offset, function(data){

		if(data != "")
		{
			$("#M2Out").val($("#M2Out").val() + data); 
            scrollDown( "#M2Out" );
			offset = offset + data.length;
			waitingtime = minwaitingtime;
		} 
		else
		{
		    waitingtime = 2*waitingtime;
		    if (waitingtime > maxwaitingtime)
		    {
		        waitingtime = maxwaitingtime;
		    }
		}
        $("#waittime").text("waiting time: " + waitingtime);
    	timerobject = setTimeout("checkForNewData()",waitingtime);
	});

}



function sendOnEnterCallback( inputfield ) {
	return function(e) {
		if (e.which == 13 && e.shiftKey) {
            e.preventDefault();
            // do not make a line break or remove selected text when sending

            sendToM2(">>SENDCOMMANDS<<\n"+getSelected( inputfield ), "You hit shift-enter!! ");
        }
	}
}

function resetCallback(e) {
    if (!sendToM2(">>RESET<<", "We are resetting the current M2 session.\n")) {
        $("#M2Out").val($("#M2Out").val() + "<b>Something Broke! HELP!</b>");
    }
    $("#M2Out").val("");
}

function sendCallback( inputField ) {
	return function(e) {
    	var str = getSelected( inputField );
	    sendToM2(">>SENDCOMMANDS<<\n"+str, "");
	    return false;
	}
}

// return false on error
function sendToM2(myCommand, baseString) {
    clearTimeout(timerobject);
    waitingtime = minwaitingtime;
    $("#waittime").text("waiting time: " + waitingtime);
    timerobject = setTimeout("checkForNewData()",waitingtime);
    
    $.post("sockets/M2Client.php", {
        cmd: myCommand
    },
    function(data) {
        if (data != "0") { 
            $("#M2Out").val($("#M2Out").val() + "Something Broke! HELP!");
            return false;
        }
    });
    return true;
}

function scrollDown( area ) {
    mySize = $(area).val().length;
    $(area).scrollTop(mySize);
    return false;
    // Return false to cancel the default link action
}

/* get selected text, or current line, in the textarea #M2In */
function getSelected( inputField) {
    var str = $(inputField).val();
    var start = $(inputField)[0].selectionStart;
    var end = $(inputField)[0].selectionEnd;
    if (start == end) {
        // grab the current line
        start = 1 + str.lastIndexOf("\n", end - 1);
        var endPos = str.indexOf("\n", start);
        if (endPos != -1) {
            end = endPos;
        } else {
            end = str.length;
        }
    }
    return str.slice(start, end) + "\n";
}



/* Info on selected text:
 * jquery plugin: jquery-fieldselection.js
 * example use: http://laboratorium.0xab.cd/jquery/fieldselection/0.1.0/test.html
 * DOM: selectionStart, selectionEnd
 *  stackoverflow: search for selectionStart
 */
