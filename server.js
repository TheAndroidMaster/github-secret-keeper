var hapi = require('hapi')
var got = require('got')
var fs = require('fs')
var Hapi = require('hapi')
var Boom = require('boom')
var GoodLogger = require('good')
var GoodConsole = require('good-console')
var extend = require('extend-object')
var env = require('./env.json')

var server = new Hapi.Server()
var port = process.env.PORT || 5000

function htmlWrap(str) {
	return "<!DOCTYPE html>\n"
			+ "<html>\n"
			+ "<head>\n"
			+ "<title>GitHub Secret Keeper</title>\n"
			+ "<link href=\"https://jfenn.me/css/styles.css\" rel=\"stylesheet\">\n"
			+ "</head>\n"
			+ "<body><main>\n"
			+ str + "<br><br><br><hr>\n"
			+ "This is a Heroku application based on <a href=\"https://github.com/HenrikJoreteg/github-secret-keeper/\">HenrikJoreteg/github-secret-keeper</a>, "
			+ "modified by James Fenn for personal use.<br>\n"
			+ "You can see its source code <a href=\"https://jfenn.me/redirects/?t=github&d=github-secret-keeper\">here</a>."
			+ "</main></body>\n"
			+ "</html>";
}

function auth(req, res) {
	var code = req.params.code || req.query.code
	var client = req.params.client
	var redirectUri = req.query.redirect_uri
	var state = req.query.state
	var domain = req.query.domain || 'github.com'

	// attempt to look up the client
	var secret = process.env[client]

	if (!secret) {
		res({statusCode: 404});
		return;
	}

	var options = {
		body: {
			client_id: client,
			client_secret: secret,
			code: code
		},
		json: true
	}
	
	// include the optional query params if present
	if (req.query.redirect_uri) {
		options.body.redirect_uri = req.query.redirect_uri
	}
	
	if (req.query.state) {
		options.body.state = req.query.state
	}

	got.post('https://' + domain + '/login/oauth/access_token', options, res);
}

// extend process env with env.json if provided
extend(process.env, env)

server.connection({
  host: '0.0.0.0',
  port: port,
  routes: { cors: true }
})

server.route({
	method: 'GET',
	path: '/{client}/{code}',
	handler: function (req, reply) {
		auth(req, function(err, body, response) {
			if (err) {
				if (err.statusCode === 404) {
					return reply(Boom.create(err.statusCode, 'GitHub could not find client ID: \'' + req.params.client + '\''))
				} else {
					return reply(Boom.create(500, err))
				}
			} else {
				if (body.error) {
					return reply(Boom.create(400, body.error_description))
				}
				
				return reply(body)
			}
		})
	}
})

server.route({
	method: 'GET',
	path: '/discord/{client}',
	handler: function(req, reply) {
		auth(req, function(err, body, response) {
			if (err) {
				if (err.statusCode === 404) {
					return reply(htmlWrap("GitHub could not find client ID: \'<code>" + req.params.client + "</code>\'"))
				} else {
					return reply(Boom.create(500, err))
				}
			} else {
				if (body.error) {
					return reply(htmlWrap(body.error_description))
				}
				
				return reply(htmlWrap("Your token is:<br>\n"
						+ "<code>" + body.access_token + "</code><br><br>\n"
						+ "Copy the token, then return to Discord and message the bot \"!github auth [token]\"."))
			}
		})
	}
})

server.register({
    register: GoodLogger,
    options: {
      reporters: [{
        reporter: GoodConsole,
        events: { log: '*', response: '*' }
      }]
    }
  },
  function (err) {
    if (err) {
      console.error(err)
    }
    else {
      server.start(function () {
        console.info('token server started at ' + server.info.uri)
      })
    }
})
