import { ApiProperty } from '@nestjs/swagger';
import { OutageType } from '@prisma/client';

export class AggregatedOutageDto {
  @ApiProperty({ description: 'Aggregated outage identifier.', example: 1 })
  id: number;

  @ApiProperty({
    description: 'Controller identifier that produced the outage telemetry.',
    example: 'AOT1D-25090001',
  })
  controllerId: string;

  @ApiProperty({
    description: 'Aggregated outage type.',
    enum: OutageType,
    example: OutageType.led_outage,
  })
  outageType: OutageType;

  @ApiProperty({
    description: 'Window start of the aggregated outage.',
    type: String,
    format: 'date-time',
    example: '2025-01-15T00:00:00.000Z',
  })
  startTime: Date;

  @ApiProperty({
    description: 'Window end of the aggregated outage.',
    type: String,
    format: 'date-time',
    example: '2025-01-15T00:30:00.000Z',
  })
  endTime: Date;
}
