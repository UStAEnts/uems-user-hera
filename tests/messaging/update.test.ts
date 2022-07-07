import winston from "winston";

winston.add(new winston.transports.Console());

import MongoUnit from 'mongo-unit';
import { UserDatabase } from "../../src/database/UserDatabase";
import { Db, MongoClient, ObjectId } from 'mongodb';

jest.setTimeout(20000);

describe('executing delete messages delete the proper entities', () => {

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
    beforeEach(async () => {
        await db.collection('details').insertMany([
            {
                _id: new ObjectId("56d9bf92f9be48771d6fe5b1"),
                email: "email one",
                name: "name",
                uid: "uid1",
                username: "username one",
            }, {
                _id: new ObjectId("56d9bf92f9be48771d6fe5b2"),
                email: "email two",
                name: "name",
                uid: "uid2",
                username: "username two",
            }, {
                _id: new ObjectId("56d9bf92f9be48771d6fe5b3"),
                email: "email three",
                name: "name",
                uid: "uid3",
                username: "username three",
            }
        ]);
    });

    afterEach(async () => {
        await db.collection('details').deleteMany({});
        await MongoUnit.drop();
    })

    it('basic update should succeed', async () => {
        const id = await database.update({
            msg_intention: "UPDATE",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            id: 'uid1',

            email: 'new email',
            name: 'new name',
            profile: 'new profile',
            username: 'new username',
        });

        // Check the result is valid
        await expect(id).toHaveLength(1);

        // Then check that the database query returns the same data
        const results = await database.query({
            msg_intention: "READ",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            id: 'uid1',
            includeEmail: true,
        });

        // Make sure only one result is given
        await expect(results).toHaveLength(1);

        // Check that the data matches
        await expect(results[0].email).toEqual('new email');
        await expect(results[0].username).toEqual('new username');
        await expect(results[0].name).toEqual('new name');
        await expect(results[0].profile).toEqual('new profile');
    });

    it('updating with the ObjectID should not work', async () => {
        await expect(database.update({
            msg_intention: "UPDATE",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            id: '56d9bf92f9be48771d6fe5b2',
            username: 'new username',
        })).rejects.toThrowError('invalid user ID')

        const results = await database.query({
            msg_intention: "READ",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            id: 'uid1',
            includeEmail: true,
        });

        // Make sure only one result is given
        await expect(results).toHaveLength(1);

        // Check that the data matches
        await expect(results[0].email).toEqual('email one');
        await expect(results[0].username).toEqual('username one');
        await expect(results[0].name).toEqual('name');
    })

    it('updating invalid ID should not work', async () => {
        await expect(database.update({
            msg_intention: "UPDATE",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            id: 'uid4',
            username: 'new username',
        })).rejects.toThrowError('invalid user ID')
    });

    it('updating with no changes should not work', async () => {
        await expect(database.update({
            msg_intention: "UPDATE",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            id: 'uid4',
        })).rejects.toThrowError('no operations provided');
    });
});
