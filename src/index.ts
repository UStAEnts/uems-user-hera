import fs from 'fs/promises';
import path from 'path';
import {_ml} from './logging/Log';
import {UserDatabase} from "./database/UserDatabase";
import bind from "./Binding";
import {ConfigurationSchema} from "./ConfigurationTypes";

import CONSTANTS from "./constants/Constants";
import {LoggedError} from "./error/LoggedError";
import {launchCheck, RabbitNetworkHandler, tryApplyTrait} from "@uems/micro-builder/build/src";
import {
    has,
    UserMessage as UM,
    UserResponse as UR,
    UserMessageValidator,
    UserResponseValidator,
    DiscoveryMessage,
    DiscoveryResponse,
    DiscoveryResponseValidator,
    DiscoveryMessageValidator
} from '@uems/uemscommlib';
import {MongoClient} from "mongodb";

const CONFIG_FILE_LOCATION = process.env.UEMS_HERA_CONFIG_LOCATION ?? path.join(__dirname, '..', '..', 'config', 'configuration.json');

const __ = _ml(__filename);

launchCheck(['successful', 'errored', 'rabbitmq', 'database', 'config'], (traits: Record<string, any>) => {
    if (has(traits, 'rabbitmq') && traits.rabbitmq !== '_undefined' && !traits.rabbitmq) return 'unhealthy';
    if (has(traits, 'database') && traits.database !== '_undefined' && !traits.database) return 'unhealthy';
    if (has(traits, 'config') && traits.config !== '_undefined' && !traits.config) return 'unhealthy';

    // If 75% of results fail then we return false
    if (has(traits, 'successful') && has(traits, 'errored')) {
        const errorPercentage = traits.errored / (traits.successful + traits.errored);
        if (errorPercentage > 0.05) return 'unhealthy-serving';
    }

    return 'healthy';
});

__.info('starting hera...');

async function launch() {
    let configData;

    try {
        configData = await fs.readFile(CONFIG_FILE_LOCATION, {encoding: 'utf8'});
        __.debug('loaded configuration file');
    } catch (e: any) {
        if (e.code === 'ENOENT') {
            __.error('failed to launch: ' + CONSTANTS.messages.NO_CONFIG_FILE);
            process.exitCode = CONSTANTS.codes.NO_CONFIG_FILE;
            tryApplyTrait('config', false);
            throw new LoggedError();
        }

        throw e;
    }

    let configJSON;

    try {
        configJSON = JSON.parse(configData);
    } catch (e) {
        __.error('failed to launch: ' + CONSTANTS.messages.INVALID_CONFIG_FILE + ' (invalid JSON)', {e});
        process.exitCode = CONSTANTS.codes.INVALID_CONFIG_FILE;
        tryApplyTrait('config', false);
        throw new LoggedError();
    }

    const parsed = ConfigurationSchema.safeParse(configJSON);
    if (!parsed.success) {
        __.error('failed to launch: ' + CONSTANTS.messages.INVALID_CONFIG_FILE + ' (invalid content)', {
            warnings: parsed.error,
        });
        process.exitCode = CONSTANTS.codes.INVALID_CONFIG_FILE;
        tryApplyTrait('config', false);
        throw new LoggedError();
    }
    let config = parsed.data;
    tryApplyTrait('config', true);

    let database!: UserDatabase;

    try {
        __.info('setting up database connection');
        await new Promise<void>(async (resolve, reject) => {
            if (process.env.UEMS_RAW_MONGO_URI) {
                __.info('using raw uri');
                const client = new MongoClient(process.env.UEMS_RAW_MONGO_URI, {
                    useUnifiedTopology: true,
                });
                await client.connect();
                database = new UserDatabase(client.db(), config.database.collections);
            } else {
                database = new UserDatabase(config.database);
            }

            const readyUnbind = database.once('ready', () => {
                readyUnbind();
                tryApplyTrait('database', true);
                resolve();
            });

            const errorUnbind = database.once('error', (e) => {
                errorUnbind();
                tryApplyTrait('database', false);
                reject(e);
            });
        });

        __.info('database connection enabled');
    } catch (e) {
        __.error('failed to launch: ' + CONSTANTS.messages.COULD_NOT_CONNECT_TO_DB, {e});
        process.exitCode = CONSTANTS.codes.COULD_NOT_CONNECT_TO_DB;
        tryApplyTrait('database', false);
        throw new LoggedError();
    }

    let messenger: RabbitNetworkHandler<UM.UserMessage | DiscoveryMessage.DiscoveryDeleteMessage,
        UM.CreateUserMessage,
        UM.DeleteUserMessage,
        UM.ReadUserMessage | DiscoveryMessage.DiscoveryDeleteMessage,
        UM.UpdateUserMessage,
        // @ts-ignore
        UR.UserReadResponseMessage | UR.UserResponseMessage | DiscoveryResponse.DiscoveryDeleteResponse>;

    try {
        messenger = new RabbitNetworkHandler<UM.UserMessage | DiscoveryMessage.DiscoveryDeleteMessage,
            UM.CreateUserMessage,
            UM.DeleteUserMessage,
            UM.ReadUserMessage | DiscoveryMessage.DiscoveryDeleteMessage,
            UM.UpdateUserMessage,
            // @ts-ignore
            UR.UserReadResponseMessage | UR.UserResponseMessage | DiscoveryResponse.DiscoveryDeleteResponse>
        (
            config.message,
            async (data) => {
                console.log('got', data);
                try {
                    const r = await new UserMessageValidator().validate(data);
                    if (r) return r;
                } catch (e) {
                }
                return await new DiscoveryMessageValidator().validate(data);
            },
            async (data) => {
                console.log('sending', data);
                try {
                    const r = await new UserResponseValidator().validate(data)
                    if (r) return r;
                } catch (e) {
                }
                return await new DiscoveryResponseValidator().validate(data);
            },
        );

        await new Promise<void>((resolve, reject) => {
            const unbindError = messenger.once('error', (err) => {
                unbindError();
                tryApplyTrait('rabbitmq', false);
                reject(err);
            });

            const unbindReady = messenger.once('ready', () => {
                unbindReady();
                tryApplyTrait('rabbitmq', true);
                resolve();
            });
        });

        __.info('message broker enabled');
    } catch (e) {
        __.error('failed to launch: ' + CONSTANTS.messages.COULD_NOT_CONNECT_TO_AMQPLIB, {e});
        process.exitCode = CONSTANTS.codes.COULD_NOT_CONNECT_TO_AMQPLIB;
        tryApplyTrait('rabbitmq', false);
        throw new LoggedError();
    }

    __.info('binding database to messenger');
    bind(database, messenger);

    __.info('hera up and running');
}

launch().catch((e) => {
    if (!(e instanceof LoggedError)) {
        __.error('failed to launch: an unknown error was encountered', {e});
    }
})
