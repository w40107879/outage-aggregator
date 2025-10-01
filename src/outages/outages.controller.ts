import { Controller, Get, Query } from '@nestjs/common';
import { OutagesService } from './outages.service';
import { QueryOutagesDto } from './dto/query-outages.dto';

@Controller('outages')
export class OutagesController {
  constructor(private readonly svc: OutagesService) {}

  @Get()
  async find(@Query() q: QueryOutagesDto) {
    return this.svc.find({
      type: q.type,
      start: new Date(q.start),
      end: new Date(q.end),
      controllerId: q.controllerId,
    });
  }
}
