/* Radiocicos.js - a simple bot in node.js
 *
 * author: radiocicletta <radiocicletta@gmail.com>
 * requires: nodejs, irc-js module
 *
 * npm install irc-js
 */

const kIRCNickName      = 'radiocicosojs';
const kIRCServerHost    = 'irc.freenode.net';
const kIRCServerPort    = 6667;

var http = require('http');
var IRC = require('irc-js');

var channels = ['#radiocicletta'/*, '#other'*/];
var goodguys = ['leonardo', 'cassapanco', 'autoscatto', 'Biappi'];
var users = {};

var schedule = {events:[]};
var podcasts = {data:[]};
var podcastsupdate = new Date();
var onair    = '';

var ircconn = new IRC({
    server: kIRCServerHost,
    nick: kIRCNickName,
    port: kIRCServerPort,
    log: false
});

// these handlers are allowed to reply in rooms and/or in query
var cmdhandlers = {
    muori   : function(respchan) { 
                    ircconn.disconnect();
                    clearInterval(scheduleid);
                    clearTimeout(remainderid); 
                    clearTimeout(mixcloudid);
                },
    help    : function(respchan) { 
                    this.privmsg(respchan, "Per chiedermi qualcosa, usa un comando" +
                            " preceduto da una chiocciola (ad" +
                            " es. @help). per conoscere la descrizione di tutti i comandi" +
                            " scrivi @longhelp\nComandi disponibili:" +
                            " @help @longhelp @cosera @oggi @inonda @ascolto @podcast");
                },
    cosera  : function(respchan) { 
                var irc = this;
                http.get({ host:'www.radiocicletta.it', 
                            port:8000, 
                            path:'/json.xsl'}, function(res) {
                                var rawdata = "";
                                res.on('data', function(data){ rawdata += data.toString('utf-8'); })
                                   .on('end', function(){
                                        var json = JSON.parse(rawdata);
                                        var music = "Unknown - unknown";
                                        if (json["/stream"])
                                            music = json["/stream"].artist + " - " + json["/stream"].title;
                                        else if (json["/studio"])
                                            music = json["/studio"].artist + " - " + json["/studio"].title;
                                        irc.privmsg(respchan, music); 
                                    });
                    });
                },
    inonda  : function(respchan) {
                    var date = new Date();
                    var day = ["do", "lu", "ma", "me", "gi", "ve", "sa"][date.getDay()];
                    var today = schedule.events.filter(function(el, idx, ar){ 
                            return el.start[0] === day && 
                                    (el.start[1] < date.getHours() || 
                                        (el.start[1] === date.getHours() && (date.getMinutes() > (el.start[2] || 0)))) &&
                                    (el.end[1] > date.getHours() || 
                                        (el.end[1] === date.getHours() && (date.getMinutes() < (el.end[2] || 0))));
                        });

                    var msg = "Ora in onda: " + (today.length ? today[0].title.replace(/<\/*[^>]*>/g, ''): "Musica no stop");
                    this.privmsg(respchan, msg);
                },
    dillo   : function(respchan) {}
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
    ascolto     : function(respchan) {
                        this.privmsg(respchan, "Puoi ascoltare radiocicletta in diversi modi:\n" +
                                "• Dal tuo browser, collegandoti al sito " +
                                "http://www.radiocicletta.it e usando il player del sito\n" +
                                "• Usando il tuo programma preferito (VLC, iTunes, RealPlayer...) " +
                                "inserendo nella playlist l'indirizzo " +
                                "http://www.radiociclcetta.it:8000/stream\n" +
                                "• Se hai problemi di connessione o sei connesso " +
                                "attraverso una rete con proxy, puoi usare l'indirizzo " +
                                "http://www.radiociclcetta.it/snd/stream", true);
                    },
    oggi        : function(respchan) {
                        var day = ["do", "lu", "ma", "me", "gi", "ve", "sa"][new Date().getDay()];
                        var today = schedule.events.filter(function(el, idx, ar){ return el.start[0] === day});
                        today.sort(function(a,b){return a.start[0] < b.start[0]});

                        var todaystr = "";
                        today.forEach(function(el, idx, ar){
                            todaystr += el.start[1] + ":" + 
                                        (el.start[2]? el.start[2]: "00") + 
                                        " " + el.title.replace(/<\/*[^>]*>/g,'') + "\n";
                        })
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
                                                msg += el.name + '\n   ' + el.url + '\n ';
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
                    }
}


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
        } catch(e) {console.log(e)};

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
                    schedule = JSON.parse(rawdata);
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
        var today = schedule.events.filter(function(el, idx, ar){ 
                return el.start[0] === day && 
                        (el.end[1] > now.getHours() || (el.end[1] === now.getHours() && now.getMinutes() < (el.end[2] | 0)));
            }).sort(function(a,b) {return a.start[1] > b.start[1] || (a.start[1] === b.start[1] && (a.start[2] || 0) > (b.start[2] ||0))});

        if (today.length)
            channels.forEach(function(el, idx, ar){
                this.privmsg(el, " \nORA IN ONDA: " + today[0].title.replace(/<\/*[^>]*>/g, '') + "\n" +
                                ( today.length > 1?
                                    "ALLE " + today[1].start[1] + "." + (today[1].start[2] || '00') + ": " +
                                    today[1].title.replace(/<\/*[^>]*>/g, '') + '\n ': ''), true);
            }, ircconn);

        to.setMinutes(50);
        to.setSeconds(0);
        var delay = (to > now? to - now: 3600000 + to.getTime() - now.getTime());
        
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

                                var newpods = podcasts.data.filter(function(el, idx, ar){ return Date.parse(el.updated_time > podcastsupdate.getTime());});

                                if (!newpods.length)
                                    return;

                                podcastsupdate = new Date();

                                var msg = ' \nNUOVI PODCAST:\n \n';

                                newpods.forEach(function(el, idx, ar){
                                    msg += ' • ';
                                    msg += el.name + '\n   ' + el.url + '\n ';
                                });

                                msg +=  ' \nL\'elenco completo dei podcast lo trovi su http://www.mixcloud.com' +
                                        '. Scrivi @podcast per l\'elenco degli ultimi podcast';

                                channels.forEach(function(el, idx, ar){
                                    this.privmsg(el, msg, true);
                                }, ircconn);
                            });
            });
        to.setMinutes(30);
        to.setSeconds(0);
        var delay = (to > now? to - now: 7200000 + to.getTime() - now.getTime());
        
        mixcloudid = setTimeout(loop, delay);
    }

    loop();
})();


ircconn.connect(function(){
    channels.forEach(function(el, idx, ar){
        this.join(el);
    }, ircconn);
});
