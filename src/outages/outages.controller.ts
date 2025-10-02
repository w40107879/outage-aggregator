import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AggregatedOutageDto } from './dto/aggregated-outage.dto';
import { QueryOutagesDto } from './dto/query-outages.dto';
import { OutagesService } from './outages.service';

@ApiTags('Outages')
@Controller('outages')
export class OutagesController {
  constructor(private readonly outagesService: OutagesService) {}

  @ApiOperation({
    summary: 'Retrieve aggregated outage windows for the given filters.',
  })
  @ApiOkResponse({
    description:
      'Aggregated outages whose windows overlap the requested range.',
    type: AggregatedOutageDto,
    isArray: true,
  })
  @ApiBadRequestResponse({ description: 'Validation failed.' })
  @Get()
  async find(@Query() q: QueryOutagesDto) {
    return this.outagesService.find({
      type: q.type,
      start: new Date(q.start),
      end: new Date(q.end),
      controllerId: q.controllerId,
    });
  }
}
