import winston from "winston";

winston.add(new winston.transports.Console());

import MongoUnit from 'mongo-unit';
import { UserDatabase } from "../../src/database/UserDatabase";
import { Db, MongoClient, ObjectId } from 'mongodb';

jest.setTimeout(20000);

describe('executing create messages create the proper entities', () => {

    let client: MongoClient;
    let db: Db;
    let database: UserDatabase;

    beforeAll(async () => {
        // Setup the in memory mongo db database
        await MongoUnit.start();

        // Create the database connection and connect to the one we just created in memory
        client = new MongoClient(MongoUnit.getUrl(), {
            useUnifiedTopology: true,
        });
        await client.connect();

        // Then create a user database around this
        db = client.db('testing');
        database = new UserDatabase(db, {
            details: 'details',
            changelog: 'changelog',
        });
    });

    afterAll(() => {
        // Shutdown our connection to the database
        client.close();

        // Then stop the in memory database
        MongoUnit.stop();
    });

    // Before we begin each test we'll reset the database to make sure that we start on a clean slate
    afterEach(() => Promise.allSettled([
        db.collection('details').deleteMany({}),
        db.collection('changelog').deleteMany({})
    ]));

    it('basic create should succeed', async () => {
        const id = await database.create({
            msg_intention: "CREATE",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            email: 'email',
            username: 'username',
            name: 'name',
            id: 'id',
            profile: 'profile',
        });

        // Check the result is valid
        await expect(id).toHaveLength(1);
        await expect(id[0]).toEqual('id');

        // Then check that the database query returns the same data
        const results = await database.query({
            msg_intention: "READ",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            includeEmail: true,
        });

        // Make sure only one result is given
        await expect(results).toHaveLength(1);

        // Check that the data matches
        await expect(results[0].email).toEqual('email');
        await expect(results[0].username).toEqual('username');
        await expect(results[0].name).toEqual('name');
        await expect(results[0].id).toEqual('id');
        await expect(results[0].profile).toEqual('profile');

        // Check that the response has these keys and these keys only
        await expect(Object.keys(results[0]).sort()).toEqual(['email', 'username', 'name', 'id', 'profile'].sort());
    });

    it('creating with additional properties will return results without it', async () => {
        const id = await database.create({
            msg_intention: "CREATE",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            email: 'email',
            username: 'username',
            name: 'name',
            id: 'id',
            profile: 'profile',
            // @ts-ignore
            additionalProp: 'one',
            addPropTwo: 'something else',
        });

        // Check the result is valid
        await expect(id).toHaveLength(1);
        await expect(id[0]).toEqual('id');

        // Then check that the database query returns the same data
        const results = await database.query({
            msg_intention: "READ",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
        });

        // Make sure only one result is given
        await expect(results).toHaveLength(1);

        // Check that the response has these keys and these keys only

        const allowed = ['email', 'username', 'name', 'id', 'profile'];
        for (const key of Object.keys(results[0])) {
            expect(allowed).toContain(key);
        }
    });

})
