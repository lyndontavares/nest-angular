import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { TadorService } from './tador.service';
import { ReqUser } from '../decorators/user.decorator';
import { User } from 'shared/models';
import { Panel } from 'shared/models/tador/panels';
import { AuthorizeInterceptor } from '../middlewares/authorize.middleware';
import { ActionType } from 'shared/models/tador/enum';

@UseInterceptors(AuthorizeInterceptor)
@Controller('tador')
export class TadorController {
    constructor(private service: TadorService) {}

    @Get('initialData')
    async initialData(@ReqUser() user: User): Promise<Panel[]> {
        return this.service.panelRepo.findMany({ userId: user.id });
    }

    @Get('savePanel')
    async savePanel(panel: Panel): Promise<any> {
        return this.service.panelRepo.saveOrUpdateOne(panel);
    }

    @Get('status')
    async status(panel: Panel, type: ActionType): Promise<any> {
        return this.service.addStatus(panel, type);
    }
}
