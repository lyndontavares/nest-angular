import { Injectable } from '@nestjs/common';
import { Repository, RepositoryFactory } from 'mongo-nest';
import * as Panels from 'shared/models/tador/panels';
import { MPPanel, Panel } from 'shared/models/tador/panels';
import { createServer, Socket } from 'net';
import { UserService } from '../services/user.service';
import { ActionType, PanelType } from 'shared/models/tador/enum';
import { Entity } from 'shared/models';

class PanelDump extends Entity {
    dump: string;
}

interface Action {
    type: ActionType;
    pId: string;
    data: any;
}

export interface RegisterAction extends Action {
    data: { type: PanelType; uId: string };
}

@Injectable()
export class TadorService {
    panelRepo: Repository<Panel>;
    panelDumpRepo: Repository<PanelDump>;
    constructor(private repositoryFactory: RepositoryFactory, private userService: UserService) {
        this.panelRepo = this.repositoryFactory.getRepository<Panel>(Panel, 'tador');
        this.panelDumpRepo = this.repositoryFactory.getRepository<PanelDump>(PanelDump, 'tador');
        this.startListen();
    }
    statuses = {};

    async addStatus(panel: Panel, type: ActionType) {
        if (!this.statuses[panel.panelId]) {
            this.statuses[panel.panelId] = [];
        }
        switch (type) {
            case ActionType.read: {
                const oldDump = (await this.panelDumpRepo.findOne({ _id: panel.panelId })).dump;
                const newDump = panel.dump();
                panel.contacts.contactFields.forEach(field => {
                    const fieldLength = field.length;
                    const index = field.index;
                    for (let i = 0; i < panel.contacts.count; i++) {
                        const start = index + fieldLength * i;
                        const oldValue = oldDump.slice(start, start + fieldLength + 1);
                        const newValue = newDump.slice(start, start + fieldLength + 1);
                        if (oldValue != newValue) {
                            this.statuses[panel.panelId].push({ action: ActionType.read, index: start, data: newValue });
                        }
                    }
                });

                panel.settings.forEach(s => {
                    if (s.index) {
                        const newValue = newDump.slice(s.index, s.length + 1);
                        const oldValue = oldDump.slice(s.index, s.length + 1);
                        if (newValue != oldValue) {
                            this.statuses[panel.panelId].push({ action: ActionType.read, index: s.index, data: newValue });
                        }
                        return;
                    }

                    s.fields.forEach((f, i) => {
                        const newValue = newDump.slice(f.index, f.length + 1);
                        const oldValue = oldDump.slice(f.index, f.length + 1);
                        if (newValue != oldValue) {
                            this.statuses[panel.panelId].push({ action: ActionType.read, index: s.index, data: newValue });
                        }
                    });
                });
                break;
            }
            case ActionType.readAll: {
                this.statuses[panel.panelId].push(ActionType.readAll);
                break;
            }
            case ActionType.writeAll: {
                this.statuses[panel.panelId].push(ActionType.writeAll);
                break;
            }
        }
    }

    startListen() {
        const port = 4000;
        const host = '0.0.0.0';
        const server = createServer();

        const listen = () => {
            server.listen(port, host, () => {
                console.log('TCP Server is running on port ' + port + '.');
            });
        };
        const close = () => {
            server.close();
        };

        listen();
        server.on('error', err => {
            console.log(err);
            close();
            listen();
        });

        server.on('connection', sock => {
            console.log('CONNECTED: ' + sock.remoteAddress + ':' + sock.remotePort);
            setTimeout(() => sock.end(), 3000);
            sock.on('data', msg => {
                try {
                    const msgString = msg.toString('utf8');
                    const action: Action = JSON.parse(msgString);
                    console.log('DATA ' + sock.remoteAddress + ': ' + action);
                    switch (action.type) {
                        case ActionType.register:
                            return this.register(action, sock);
                        case ActionType.readAll:
                            return this.read(action, sock, 16);
                        case ActionType.read:
                            return this.read(action, sock, 1);
                        case ActionType.write:
                            return this.write(action, sock, 1);
                        case ActionType.writeAll:
                            return this.write(action, sock, 16);
                        case ActionType.status:
                            return this.getStatus(action, sock);
                    }
                } catch (e) {
                    console.log(e);
                }
            });

            sock.on('close', () => {
                console.log('CLOSED: ' + sock.remoteAddress + ' ' + sock.remotePort);
            });
        });
    }

    private async register(action: RegisterAction, sock: Socket) {
        const data = action.data;
        const user = await this.userService.userRepo.findOne({ email: data.uId });
        const userPanel = await this.panelRepo.findOne({ panelId: action.pId });
        if (userPanel) {
            sock.write('0');
            return;
        }
        const panel = new Panels[data.type + 'Panel']({
            name: '',
            address: '',
            userId: user.email,
            panelId: action.pId,
        });
        const saveResult = await this.panelRepo.collection.insertOne(panel);
        sock.write(saveResult.result.ok.toString());
    }

    private async read(action: Action, sock: Socket, multiply = 1) {
        let panel = await this.panelRepo.findOne({ panelId: action.pId });
        panel = new Panels[panel.type + 'Panel'](panel);
        const start = action.data.start * multiply;
        const length = action.data.length * multiply;
        sock.write(panel.dump().slice(start, start + length));
        this.saveDump(panel);
    }
    private async write(action: Action, sock: Socket, multiply = 1) {
        let panel = await this.panelRepo.findOne({ panelId: action.pId });
        panel = new Panels[panel.type + 'Panel'](panel);
        const dump = panel.dump().split('');
        const start = action.data.start * multiply;
        const length = action.data.data.length;
        for (let i = start; i < start + length; i++) {
            dump[i] = action.data.data[i - start];
        }
        panel.reDump(dump.join(''));
        const saveResult = await this.panelRepo.saveOrUpdateOne(panel);
        sock.write(saveResult.result.ok.toString());
        this.saveDump(panel);
    }

    private getStatus(action: Action, sock: Socket) {
        const panelStatus = this.statuses[action.pId];
        if (!panelStatus || !panelStatus.length) {
            return sock.write('0');
        }
        return sock.write(panelStatus.pop().toString());
    }

    private saveDump(panel: Panel) {
        this.panelDumpRepo.saveOrUpdateOne({ _id: panel._id, dump: panel.dump() });
    }
}