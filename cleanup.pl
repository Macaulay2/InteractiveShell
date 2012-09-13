#!/usr/bin/perl

my $limit = 0;
my $max_fork = 30;
my $max_idle_min = 0;

print "Cleaning. Time: ";
print localtime(time)."\n";


my ($sec,$min,$hour,$mday,$mon,$year,$wday,$yday,$isdst) = localtime(time);

my @schroots;
open FH, "ls -al /home/m2user/sessions |" or die "Failed to open pipe.";
while(<FH>){
	my $current = $_;
	if(($current =~ m/.* user.*/)&&($current !~ m/.*kill.*/)){
		#print "Keeping: ".$current;
		push @schroots, $current;
	}
	else {
		#print "Dropping: ".$current;
	}
}
close FH;

my $num_schroots = @schroots;
print "There are ".$num_schroots." schroots running.\n";
if($num_schroots>$limit){
	foreach my $s (@schroots){
		my @split = split(' ',$s);
		my $schrootid = $split[8];
		#print "SchrootID: ".$schrootid."\n";
		my($lm_h,$lm_m) = ($split[7] =~ m/(.*):(.*)/);
		#print "Minutes: ".$lm_m."\n";
		my $idle_min = $min>=$lm_m ? ($min-$lm_m) : (60+$min-$lm_m);
		if($idle_min > $max_idle_min){
			#print "Unmounting schroot ".$schrootid."\n";
			#system("rm /home/m2user/sessions/$schrootid");
			#system("touch /home/m2user/sessions/$schrootid.kill");
			#system("schroot -e -f -c $schrootid");
		} else {
			#print "This schroot stays alive.\n";
		}
	}
}
# Identify and kill fork bombs
my @open_schroots;
open FH, "ps a | grep schroot |" or die "Schroots not found.";
while(<FH>){
	#print $_;
	if(($_ !~ m/.*grep.*/) && ($_ =~ m/.*user.*/)){
		my($user) = ($_ =~ m/.*-c (.*) -u.*/);
		push @open_schroots, $user;
		#print "User: ".$user."\n";
	}
}
close FH;
print "Killing fork bombs.\n";
foreach my $s (@open_schroots){
        #print "User: ".$s."\n";
	open FH, "ps aux | grep $s |" or die "Failed to find PID.";
        my $pid = 0;
        while(<FH>){
		#print $_;
                if($_ !~ m/.*grep.*/){
			#print "Got in: ".$_;
                        my @split = split(' ',$_);
                        $pid = $split[1];
                }
        }
        close FH;
	#print "Got the pid.\n";
        open FH, "pstree $pid | wc -l |" or die "Could not count children.";
        my $numdesc = 0;
	while(<FH>){
                #print $_;
		my @split = split(' ',$_);
		$numdesc = $split[0];
        }
        close FH;
	#print "Got the descendants.\n";
	print "$pid $s $numdesc\n";
	if($numdesc > $max_fork){
		print "Unmounting user $s.\n";
		system("touch /home/m2user/sessions/$s.kill");	
		system("kill -9 $pid");
		system("rm /home/m2user/sessions/$s");
		system("schroot -e -f -c $s");
	}
}

open FH, "ps aux | grep /M2/bin/M2 |" or die "Failed to open pipe.";
my $i=0;
while(<FH>){
   my $current = $_;
   my @split = split(' ',$current);
   my $virt = $split[4];
   my $pid = $split[1];
   #print $i.": ".$virt." ".$current; $i++;
   if($virt > 500000){
      print "Using too much RAM.\n";
      #system("kill -9 $pid");
   }
}
close FH;


