/* Radiocicos.js - a simple bot in node.js
 *
 * author: radiocicletta <radiocicletta@gmail.com>
 * requires: nodejs, irc-js module
 *
 * npm install irc-js
 */

const version           = '3.0'

const kIRCNickName      = 'radiocicosojs';
const kIRCServerHost    = 'irc.freenode.net';
const kIRCServerPort    = 6667;

var http = require('http');
var IRC = require('irc-js');

var channels = ['#radiocicletta'/*, '#other'*/];
var goodguys = ['leonardo', 'cassapanco', 'autoscatto', 'Biappi', 'ineff'];
var users = {};

var schedule = {programmi:[],adesso:{}};
var podcasts = {data:[]};
var podcastsupdate = new Date();
var onair    = '';

var ircconn = new IRC({
    server: kIRCServerHost,
    nick: kIRCNickName,
    port: kIRCServerPort,
    log: false
});

var mountpoints = ["/stream","/studio","/live"];



// these handlers are allowed to reply in rooms and/or in query
var cmdhandlers = {
    help    : function(respchan) { 
                    this.privmsg(respchan, "Per chiedermi qualcosa, usa un comando" +
                            " preceduto da una chiocciola (ad" +
                            " es. @help). per conoscere la descrizione di tutti i comandi" +
                            " scrivi @longhelp\nComandi disponibili:" +
                            " @help @longhelp @cosera @oggi @inonda @ascolto @podcast");
                },
    cosera  : function(respchan) { 
                var irc = this;

                http.get({ host:'api.radiocicletta.it', 
                            port:8000, 
                            path:'/json.xsl'}, function(res) {
                                var rawdata = "";
                                res.on('data', function(data){ rawdata += data.toString('utf-8'); })
                                   .on('end', function(){
                                        var json = JSON.parse(rawdata);
                                        var music = "Unknown - unknown";
                    // We look for the first mountpoint from which someone is streaming
                    var i = 0;
                    for (; (i < mountpoints.length) && ! (mountpoints[i] in json);i++ )
                        ;
                    if( i < 3 ) //If someone is streaming
                        {
                        var mountpoint = mountpoints[i];
                        if (json[mountpoint].title !== "" && json[mountpoint].title !== "Unknown")
                            if(json[mountpoint].artist !== "" && json[mountpoint].artist !== "Unknown")
                            music = json[mountpoint].artist + " - " + json[mountpoint].title;
                            else
                            music = json[mountpoint].title;
                        }

                                        irc.privmsg(respchan, music); 

                                    });
                    });
                },
    inonda  : function(respchan) {
                    var date = new Date();
                    var day = ["do", "lu", "ma", "me", "gi", "ve", "sa"][date.getDay()];
                    var today = schedule.programmi.filter(function(el, idx, ar){ 
                            return el.start[0] === day && 
                                    (el.start[1] < date.getHours() || 
                                        (el.start[1] === date.getHours() && (date.getMinutes() > (el.start[2] || 0)))) &&
                                    (el.end[1] > date.getHours() || 
                                        (el.end[1] === date.getHours() && (date.getMinutes() < (el.end[2] || 0))));
                        });

                    var msg = "Ora in onda: " + (today.length ? today[0].title.replace(/<\/*[^>]*>/g, ''): "Musica no stop");
                    this.privmsg(respchan, msg);
                },
    dillo   : function(respchan) {},
    cheschifo: function(respchan){
                    this.privmsg(respchan,"Vedi che hai fatto\n");
                }
};

// these handlers are allowed to reply only in query
var cmdqueryhandlers = {
    longhelp    : function(respchan) { 
                        this.privmsg(respchan, "Lista dei comandi disponibili:\n \n" +
                                "@help      : mostra il messaggio di aiuto\n" +
                                "@longhelp  : mostra tutti i comandi disponibili\n" +
                                "@cosera    : mostra le informazioni sul brano appena passato\n" +
                                "@oggi      : mostra i programmi in onda oggi in radio\n" +
                                "@inonda    : mostra il programma ora in onda\n" +
                                "@ascolto   : come fare per ascoltare radiocicletta\n" +
                                "@podcast   : elenca gli ultimi 5 podcast\n", true);
                    },
    switchmounts:function(respchan){ //function which allows to goodguys to switch between the possibile mountpoints
                                     //useful in case of problems with icecast streaming metadata.
	                if(goodguys.indexOf(respchan) >= 0) {
                            mountpoints.push(mountpoints[0]);
                            mountpoints.shift();
                        } 
                    },
    //Let's allows just to the goodguys to kill radiocicoso
    muori       : function(respchan){
                        if(goodguys.indexOf(respchan) >= 0) {    
                            ircconn.disconnect();
                            clearInterval(scheduleid);
                            clearTimeout(remainderid); 
                            clearTimeout(mixcloudid);    
                        }
                    },
    ascolto     : function(respchan) {
                        this.privmsg(respchan, "Puoi ascoltare radiocicletta in diversi modi:\n" +
                                "• Dal tuo browser, collegandoti al sito " +
                                "http://www.radiocicletta.it e usando il player del sito\n" +
                                "• Usando il tuo programma preferito (VLC, iTunes, RealPlayer...) " +
                                "inserendo nella playlist l'indirizzo " +
                                "http://www.radiocicletta.it/listen.pls\n", true);
                    },
    oggi        : function(respchan) {
                        var day = ["do", "lu", "ma", "me", "gi", "ve", "sa"][new Date().getDay()];
                        var today = schedule.programmi.filter(function(el, idx, ar){ return el.start[0] === day;});
                        today.sort(function(a,b){
                            if (a.start[1] < b.start[1])
                                return false;
                            if ( a.start[1] > b.start[1] || a.start[2] > b.start[2] )
                                return true;
                            return false;
                        });
                        var todaystr = "";
                        today.forEach(function(el, idx, ar){
                            todaystr += el.start[1] + ":" + 
                                        (el.start[2]? el.start[2]: "00") + 
                                        " " + el.title.replace(/<\/*[^>]*>/g,'') + "\n";
                        });
                        this.privmsg(respchan, "I programmi di oggi:\n" + todaystr, true);
                    },
    podcast     : function(respchan) {
                        http.get({ host:'api.mixcloud.com', 
                                    port:80, 
                                    path:'/radiocicletta/cloudcasts/?limit=5'},
                                    function(res) {
                                        var rawdata = '';
                                        function pod(){
                                            if (!podcasts.data.length)
                                                return;

                                            var msg = ' \nUltimi 5 podcast:\n \n';

                                            podcasts.data.forEach(function(el, idx, ar){
                                                msg += ' • ';
                                                msg += el.name + '\n   ' + el.url + '\n';
                                            });

                                            msg += 'L\'elenco completo dei podcast lo trovi su http://www.mixcloud.com/radiocicletta/\n';

                                            ircconn.privmsg(respchan, msg, true);
                                        }
                                        if (new Date() - podcastsupdate < 3600000)
                                            pod();
                                        else 
                                        res.on('data', function(data){ rawdata += data.toString('utf-8'); })
                                            .on('end', function(){ podcasts = JSON.parse(rawdata); pod(); }); 
                            });
                    },
     version    : function(respchan) {
	              this.privmsg(respchan, "radiocicosojs version " + version + "\n");
     }
};


ircconn.on('privmsg', function(data){
    var chanorquery = data.params[0];
    var msg = data.params[1];
    var respchan = "";

    //if (msg.match(new RegExp("^\\s*" + kIRCNickName)))
    if (chanorquery.match(/^#[a-z0-9\._\-#]+/i))
        respchan = chanorquery;
    else if(chanorquery === kIRCNickName)
        respchan = data.person.nick;
    else return;

    var cmds = msg.match(/@[\w ]+/ig);
    if (!cmds)
        return;

    cmds.forEach(function(el, idx, ar) {
        var argv = el.match(/\w+/g);

        try {
            if (cmdhandlers[argv[0]]) {
                cmdhandlers[argv[0]].apply(this, [respchan].concat(argv.slice(1)));
            }
            else if (cmdqueryhandlers[argv[0]]){
                respchan = data.person.nick;
                cmdqueryhandlers[argv[0]].apply(this, [respchan].concat(argv.slice(1)));
            }
        } catch(e) {console.log(e); }

    }, ircconn);

});

function updateschedule() {
    http.get({  host:'www.radiocicletta.it', 
            port:80, path: '/programmi.json'
         }, 
        function(res) {
            var rawdata = '';
            res.on('data', function(data){ rawdata += data.toString('utf-8'); })
                .on('end', function(){
                      if(rawdata !== '' ){ //If effectively it has downloaded the list of programs
                        schedule = JSON.parse(rawdata);
                        schedule.programmi = schedule.programmi.filter(function(el, idx, ar){
                           return el.stato == 1;
                        });
                      }//otherwise leave schedule non updated, avoiding crashes.
                });
        });
}

function remainderschedule() {
    
}

updateschedule();
var scheduleid = setInterval(updateschedule, 43200000); // every 12 hours

// Remainder for next scheduled programs - every 60 minutes
var remainderid = null;
(function() {
    var now, to;

    function loop() { // Y U NO USE setInterval? Because we need a measure of time clock-based
        now = new Date();
        to = new Date();

        var day = ["do", "lu", "ma", "me", "gi", "ve", "sa"][now.getDay()];
        var dayafter = ["do", "lu", "ma", "me", "gi", "ve", "sa"][now.getDay()+1];
        var today = schedule.programmi.filter(function(el, idx, ar){ 
                return el.start[0] === day && //Let's filter from the list all programs which are going to be streamed today.......
                           // ....and that aren't ended yet
                        (!(el.end[1] < now.getHours() || (el.end[1] === now.getHours() && el.end[2] < now.getMinutes())) || 
                           (el.end[1] === 0 && el.end[2] === 0));//even those that end at midnight
            }).sort(function(a,b) {return a.start[1] > b.start[1] || (a.start[1] === b.start[1] && (a.start[2] || 0) > (b.start[2] ||0)); });

        var tomorrow = schedule.programmi.filter(function(el, idx, ar){
               return el.start[0] === dayafter;
        }).sort(function(a,b){ return a.start[1] > b.start[1] || a.start[1] === b.start[1] && a.start[2] > b.start[2];  });

	if(tomorrow.length){ //If updateschedule has already downloaded the list of program (so tomorrow isn't empty)
                      // we add to today's programs' list the programs that start at midnight
               today.push(tomorrow[0]);
               today.push(tomorrow[1]);
        }


        if (today.length && (now.getHours() > 16 || now.getHours() < 4 ))
            channels.forEach(function(el, idx, ar){
                this.privmsg(el, " \nORA IN ONDA: " + today[0].title.replace(/<\/*[^>]*>/g, '') + "\n" +
                                ( today.length > 1?
                                    "ALLE " + today[1].start[1] + "." + (today[1].start[2] || '00') + ": " +
                                    today[1].title.replace(/<\/*[^>]*>/g, '') + '\n ': ''), true);
            }, ircconn);

        to.setMinutes(50);
        to.setSeconds(0);
        var delay = (to > now? to - now: 3600000 - (now.getTime() - to.getTime()));
        console.log("delay time: " + delay);
        
        remainderid = setTimeout(loop, delay);
    }

    loop();
})();


// Remainder for mixcloud podcasts - every 120 minutes
var mixcloudid = null;
(function(){
    var now, to;

    function loop() {
        now = new Date();
        to = new Date();

        http.get({ host:'api.mixcloud.com', 
                    port:80, 
                    path:'/radiocicletta/cloudcasts/?limit=5'},
                    function(res) {
                        var rawdata = '';
                        res.on('data', function(data){ rawdata += data.toString('utf-8'); })
                            .on('end', function(){ 
                                podcasts = JSON.parse(rawdata);

                                var newpods = podcasts.data.filter(function(el, idx, ar){ return Date.parse(el.updated_time) > podcastsupdate.getTime();});

                                if (!newpods.length)
                                    return;

                                podcastsupdate = new Date();

                                var msg = ' \nNUOVI PODCAST:\n \n';

                                newpods.forEach(function(el, idx, ar){
                                    msg += ' • ';
                                    msg += el.name + '\n   ' + el.url + '\n ';
                                });

                                msg +=  ' \n\nL\'elenco completo dei podcast lo trovi su http://www.mixcloud.com' +
                                        '. Scrivi @podcast per l\'elenco degli ultimi podcast';

                                channels.forEach(function(el, idx, ar){
                                    this.privmsg(el, msg, true);
                                }, ircconn);
                            });
            });
        to.setMinutes(30);
        to.setSeconds(0);
        var delay = (to > now? to - now: 3600000 - (now.getTime() - to.getTime()));
        
        console.log("delay time: " + delay);
        mixcloudid = setTimeout(loop, delay);
    }

    loop();
})();


ircconn.connect(function(){
    channels.forEach(function(el, idx, ar){
        this.join(el);
    }, ircconn);
});
