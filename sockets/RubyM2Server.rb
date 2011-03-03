require 'socket'
require 'pty'

def lobby(socket, sd, cd)
	id = socket.gets.chomp
	if !cd[id+'msgid']
		cd[id+'msgid'] = "ID: " + id + " - "
		cd[id+'new'] = 1
		print cd[id+'msgid'] + "Msgid created.\n"
	end
	request = socket.gets.chomp
	case request
	when ">>RESET<<"
		print cd[id+'msgid'] + "Requesting reset.\n"
		m2exit(socket, id, sd, cd)
	when ">>SENDCOMMANDS<<"
		print cd[id+'msgid'] + "Receiving commands.\n"
		get_commands(socket, id, sd, cd)
	else
		print cd[id+'msgid'] + "Unrecognized request.\n"
	end
	print cd[id+'msgid'] + "Leaving lobby.\n"
end

def erase(id, sd, cd)
	print cd[id+'msgid'] + "Erase.\n"
	
	Process.kill(cd[id+'m2'])
	cd.delete(id+'m2')
	Thread.kill(cd[id+'stdoutth'])
	cd.delete(id+'stdoutth')
	
	print cd[id+'msgid'] + "Threads killed.\n"

	cd[id+'filepipe'].close
        cd[id+'stdout'].close

        cd.delete(id+'filepipe')
        cd.delete(id+'stdin')
        cd.delete(id+'stdout')

	print cd[id+'msgid'] + "This user got erased.\n"
	cd.delete(id+'msgid')
	
end

def m2exit(socket, id, sd, cd)
	socket.close
	cd[id+'stdin'].puts "exit\n"
	cd[id+'stdin'].close
	erase(id,sd,cd)
end

def nice_exit(socket, id, sd, cd)
	print "todo\n"
end

def kill(socket, id, sd, cd)
	print "todo\n"
end

def get_commands(socket, id, sd, cd)
	if cd[id+'new'] == 1
		prepare(id, sd, cd)
	end
	while cmd = socket.gets
		cd[id+'stdin'].puts preprocess(cmd)
	end
	print "todo - disconnect\n"
end

def prepare(id, sd, cd)
	print cd[id+'msgid'] + "Creating M2 process.\n"
	cd[id+'stdout'], cd[id+'stdin'], cd[id+'m2'] = PTY.spawn("M2")
	cd[id+'stdout'].sync = true
	print cd[id+'msgid'] + "The pid is " + cd[id+'m2'].to_s + ".\n"
	cd[id+'filepipe'] = File.new('results_' + id + '.txt', 'a')
	cd[id+'stdoutth'] = Thread.new {write_results(id, cd[id+'stdout'], cd)}
	cd[id+'new'] = 0
end

def write_results(id, pipe, cd)
	while res = [pipe.getc].pack('c*')
		print res
		cd[id+'filepipe'].puts res+"\n"
		cd[id+'filepipe'].flush
	end
end

def preprocess(cmd)
#	print "todo\n"
	return cmd
end

begin
	tcpserver = TCPServer.new("127.0.0.1", 10000)
	print "TCPServer ready.\n"
	if tcpserver
		server_data = Hash.new
		client_data = Hash.new
		loop do
			socket = tcpserver.accept
			if socket
				print "SERVER: Incoming connection.\n"
				Thread.new do
					lobby(socket, server_data, client_data)
				end
			end
		end
	end
end

