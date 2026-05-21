import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationMeta {
  @ApiProperty({ example: 100 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10 })
  perPage!: number;

  @ApiPropertyOptional({ example: 2 })
  nextCursor?: string;

  @ApiPropertyOptional({ example: 10 })
  totalPages?: number;
}

export class PaginatedResponse<T> {
  data!: T[];
  meta!: PaginationMeta;

  constructor(data: T[], meta: PaginationMeta) {
    this.data = data;
    this.meta = meta;
  }
}

export class QueryPaginationDto {
  @ApiPropertyOptional({ example: 1, default: 1, description: 'Page number (1-indexed)' })
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10, description: 'Items per page (max 100)' })
  limit?: number = 10;

  @ApiPropertyOptional({ example: 'desc', enum: ['asc', 'desc'], description: 'Sort order' })
  sortOrder?: 'asc' | 'desc' = 'desc';
}
