var assert = require('assert');
var SynopsisBackend = require('..');
var JSONStream = require('JSONStream');

describe('SynopsisBackend', function() {
  var backend;
  var stream;
  var jsonStream;

  beforeEach(function(done) {
		backend = new SynopsisBackend();
		backend.on('ready', function() {
			stream = backend.createStream();
			jsonStream = JSONStream.stringify(false);
			jsonStream.pipe(stream);
			done();
		}); 
  });

  it('supports creation', function() {
    assert(backend instanceof SynopsisBackend);
  });

  it('supports creation of streams', function() {
    // this is what I want to say
    // assert(stream instanceof Duplex);
    assert(typeof(stream.pipe) === 'function');
    assert(typeof(stream.read) === 'function');
    assert(typeof(stream.write) === 'function');
  });

  it('stream is not in object mode', function() {
    assert(stream._writableState.objectMode === false);
  });

  it('stream outputs JSON as Buffers', function(done) {
    stream.on('data', function(data) {
      assert(data instanceof Buffer);
      try {
        JSON.parse(data.toString());
        done();
      } catch (e) {
        assert.fail('Invalid json: ' + data);
      }
    });

    stream.write('{"name": "unit-testing", "consumerId": "1"}');
  });

  it('accepts correct patches and then re-emits them', function(done) {
    stream.on('error', done);

    jsonStream.write({
      name: 'unit-testing',
      consumerId: '1'
    });

    jsonStream.write([{
      op: 'add',
      path: '/a',
      value: 1
    }]);

    jsonStream.write([{
      op: 'add',
      path: '/b',
      value: 2
    }]);

    var expectedData = [
     [[], 0], // When connecting, you always get an update packet
   [[{
        op: 'add',
        path: '/a',
        value: 1
      }], 1],
   [[{
        op: 'add',
        path: '/b',
        value: 2
      }], 2],
  ];

    stream.pipe(JSONStream.parse()).on('data', function(data) {
      assert.deepEqual(data, expectedData.shift());

      if (expectedData.length === 0) {
        done();
      }
    });
  });

  it('emits error when patch could not be applied', function(done) {
    stream.on('error', done);

    jsonStream.write({
      name: 'unit-testing',
      consumerId: '1'
    });

    jsonStream.write([{
      op: 'add',
      path: '/a',
      value: 1
    }]);

    jsonStream.write([{
      op: 'test',
      path: '/a',
      value: 2
    }]);

    var expectedData = [
     [[], 0], // When connecting, you always get an update packet
     [[{
        op: 'add',
        path: '/a',
        value: 1
      }], 1]
    ];

    stream.pipe(JSONStream.parse()).on('data', function(data) {
      if (expectedData.length === 0) {
        // This should be an error
        assert.equal(data.error, 'patch failed');
        assert.deepEqual(data.patch, [{
          op: 'test',
          path: '/a',
          value: 2
        }]);
        return done();
      } else {
        assert.deepEqual(data, expectedData.shift());
      }
    });
  });

  it('should handle authenticator failures without taking down everything', function(done) {
    backend = new SynopsisBackend({
      authenticator: function(auth, cb) {
        cb(new Error('NEVER!!!'));
      }
    });

    backend.on('ready', function() {
			stream = backend.createStream();
			jsonStream = JSONStream.stringify(false);
			jsonStream.pipe(stream);

			jsonStream.write({
				auth: {
					network: 'google',
					access_token: 'BAD'
				},
				name: 'test'
			});

			stream.on('data', function(data) {
				data = JSON.parse(data);
				assert.equal(data.error, 'invalid auth');
				done();
			});
		});
  });
});
