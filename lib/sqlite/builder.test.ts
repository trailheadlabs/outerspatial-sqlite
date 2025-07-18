import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock better-sqlite3 Database instance
const mockDbInstance = {
  exec: vi.fn(),
  close: vi.fn(),
};

// Mock better-sqlite3
vi.mock('better-sqlite3', () => {
  return {
    default: vi.fn(() => mockDbInstance),
  };
});

vi.mock('@/lib/database', () => ({
  getEventsClient: vi.fn(),
}));

vi.mock('@/lib/graphql-client', () => ({
  default: {
    query: vi.fn(),
  },
}));

vi.mock('./database', () => ({
  getArticles: vi.fn(),
  getChallenges: vi.fn(),
  getEvents: vi.fn(),
  getOrganizations: vi.fn(),
  getPOITypes: vi.fn(),
  getSuperCategories: vi.fn(),
  getTagDescriptors: vi.fn(),
}));

// Import the functions to test after mocks are set up
import { buildCommunityDB, buildCommunityDBs } from './builder';

vi.mock('fs', () => {
  const createMockStream = (isWriteStream = false) => {
    const eventHandlers: Record<string, Array<(...args: any[]) => any>> = {};

    const stream = {
      pipe: vi.fn((dest: any) => {
        // Return the destination for chaining
        return dest;
      }),
      on: vi.fn((event: string, handler: (...args: any[]) => any) => {
        if (!eventHandlers[event]) {
          eventHandlers[event] = [];
        }
        eventHandlers[event].push(handler);

        if (event === 'finish' && isWriteStream) {
          // Simulate async finish event for write streams
          // Call with no error to trigger the upload
          setTimeout(() => handler(undefined), 50);
        }
        return stream;
      }),
      once: vi.fn((event: string, handler: (...args: any[]) => any) => {
        return stream.on(event, handler);
      }),
      emit: vi.fn((event: string, ...args: any[]) => {
        if (eventHandlers[event]) {
          eventHandlers[event].forEach((h) => h(...args));
        }
        return true;
      }),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
    };
    return stream;
  };

  return {
    default: {
      unlinkSync: vi.fn(),
      createReadStream: vi.fn(() => createMockStream(false)),
      createWriteStream: vi.fn(() => createMockStream(true)),
      writeFileSync: vi.fn(),
      promises: {
        readFile: vi.fn().mockResolvedValue(Buffer.from('test-file-content')),
      },
    },
    unlinkSync: vi.fn(),
    createReadStream: vi.fn(() => createMockStream(false)),
    createWriteStream: vi.fn(() => createMockStream(true)),
    writeFileSync: vi.fn(),
    promises: {
      readFile: vi.fn().mockResolvedValue(Buffer.from('test-file-content')),
    },
  };
});

vi.mock('mkdirp', () => ({
  mkdirp: vi.fn(),
}));

vi.mock('zlib', async (importOriginal) => {
  const actual = (await importOriginal()) as any;

  const createGzipStream = () => {
    const eventHandlers: Record<string, Array<(...args: any[]) => any>> = {};

    const stream = {
      pipe: vi.fn((dest: any) => dest),
      on: vi.fn((event: string, handler: (...args: any[]) => any) => {
        if (!eventHandlers[event]) {
          eventHandlers[event] = [];
        }
        eventHandlers[event].push(handler);
        return stream;
      }),
      once: vi.fn((event: string, handler: (...args: any[]) => any) => {
        return stream.on(event, handler);
      }),
      emit: vi.fn((event: string, ...args: any[]) => {
        if (eventHandlers[event]) {
          eventHandlers[event].forEach((h) => h(...args));
        }
        return true;
      }),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
    };
    return stream;
  };

  return {
    ...actual,
    createGzip: vi.fn(() => createGzipStream()),
  };
});

vi.mock('@aws-sdk/client-s3', () => {
  const mockS3Client = {
    send: vi.fn().mockResolvedValue({
      $metadata: { httpStatusCode: 200 },
    }),
  };

  return {
    S3Client: vi.fn(() => mockS3Client),
    PutObjectCommand: vi.fn(),
  };
});

// Mock console methods
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('SQLite Builder', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset module cache to ensure clean state
    vi.resetModules();

    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_BUCKET = 'test-bucket';

    // Reset Database mock to default behavior
    mockDbInstance.exec.mockClear();
    mockDbInstance.close.mockClear();
    mockDbInstance.exec.mockImplementation(() => {});

    // S3 mock is reset automatically via vi.clearAllMocks()
  });

  afterEach(() => {
    mockConsoleLog.mockClear();
  });

  describe('buildCommunityDB', () => {
    const mockPOITypes = {
      rows: [
        { id: 1, name: 'Viewpoint' },
        { id: 2, name: 'Parking' },
      ],
      rowCount: 2,
      command: 'SELECT',
      oid: 0,
      fields: [],
    } as any;

    const mockSuperCategories = {
      rows: [
        { id: 1, name: 'Outdoor' },
        { id: 2, name: 'Indoor' },
      ],
      rowCount: 2,
      command: 'SELECT',
      oid: 0,
      fields: [],
    } as any;

    const mockTagDescriptors = {
      rows: [
        {
          id: 1,
          key: 'difficulty',
          name: 'Difficulty',
          feature_type: 'Trail',
          category: 'Trail Info',
          super_category_id: 1,
        },
      ],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    } as any;

    const mockOrganizations = {
      rows: [
        {
          id: 1,
          name: 'Test Organization',
          logo_image_id: 123,
          uploaded_file: 'logo.jpg',
        },
      ],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    } as any;

    const mockArticles = {
      rows: [{ id: 1, name: 'Test Article' }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    } as any;

    const mockChallenges = {
      rows: [{ id: 1, name: 'Test Challenge' }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    } as any;

    const mockEvents = {
      rows: [{ id: 1, name: 'Test Event' }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    } as any;

    const mockFeatureIndexResult = {
      data: {
        a: {
          a: [
            {
              a: 1, // organization_id
              b: {
                b: 101, // id
                c: [{ a: { a: 123, b: 'area-image.jpg' } }], // image_attachments
                d: 'Test Area', // name
                e: { a: { coordinates: [-122.4, 37.8] } }, // centroid
                f: {
                  a: {
                    coordinates: [
                      [
                        [-122.5, 37.7],
                        [-122.3, 37.7],
                        [-122.3, 37.9],
                        [-122.5, 37.9],
                        [-122.5, 37.7],
                      ],
                    ],
                  },
                }, // extent
                g: [{ a: 1 }], // super_categories
                h: 'Published', // visibility
                s: [{ a: 'owner', b: 1 }], // stewardships
                t: { a: 1000.5 }, // size
                tags: [{ key: 'access:fee' }],
              },
            },
          ],
        },
        b: {
          a: [
            {
              a: 1, // organization_id
              b: {
                a: 201, // id
                b: { a: 456, b: 'outing-image.jpg' }, // featured_image
                c: 'Test Outing', // name
                d: { a: { coordinates: [-122.4, 37.8] } }, // start
                e: {
                  a: {
                    coordinates: [
                      [
                        [-122.5, 37.7],
                        [-122.3, 37.7],
                        [-122.3, 37.9],
                        [-122.5, 37.9],
                        [-122.5, 37.7],
                      ],
                    ],
                  },
                }, // extent
                f: [{ a: 1 }], // super_categories
                g: 'Published', // visibility
                s: [{ a: 'owner', b: 1 }], // stewardships
                t: 'moderate', // difficulty
                u: 'loop', // route_type
                v: '5 miles', // display_length
                w: { a: 8000 }, // route length_meters
                outing_areas: [{ outing_id: 201, area_id: 101 }],
                tags: [{ key: 'activity:hiking' }],
              },
            },
          ],
        },
        c: {
          a: [
            {
              a: 1, // organization_id
              b: {
                a: 101, // area_id
                c: 301, // id
                d: [{ a: { a: 789, b: 'poi-image.jpg' } }], // image_attachments
                e: 'Test POI', // name
                f: { a: { type: 'Point', coordinates: [-122.4, 37.8] } }, // location
                g: 1, // poi_type
                h: [{ a: 1 }], // super_categories
                i: 'Published', // visibility
                s: [{ a: 'owner', b: 1 }], // stewardships
                tags: [{ key: 'amenity:parking' }],
              },
            },
          ],
        },
        d: {
          a: [
            {
              a: 1, // organization_id
              b: {
                a: 101, // area_id
                c: 401, // id
                d: [{ a: { a: 111, b: 'trail-image.jpg' } }], // image_attachments
                e: 'Test Trail', // name
                f: { a: { coordinates: [-122.4, 37.8] } }, // start
                g: {
                  coordinates: [
                    [
                      [-122.5, 37.7],
                      [-122.3, 37.7],
                      [-122.3, 37.9],
                      [-122.5, 37.9],
                      [-122.5, 37.7],
                    ],
                  ],
                }, // extent
                h: [{ a: 1 }], // super_categories
                i: 'Published', // visibility
                s: [{ a: 'owner', b: 1 }], // stewardships
                t: 5000.5, // cached_length
                tags: [{ key: 'difficulty:moderate' }],
              },
            },
          ],
        },
      },
    };

    beforeEach(async () => {
      const {
        getArticles,
        getChallenges,
        getEvents,
        getOrganizations,
        getPOITypes,
        getSuperCategories,
        getTagDescriptors,
      } = await import('./database');

      vi.mocked(getPOITypes).mockResolvedValue(mockPOITypes);
      vi.mocked(getSuperCategories).mockResolvedValue(mockSuperCategories);
      vi.mocked(getTagDescriptors).mockResolvedValue(mockTagDescriptors);
      vi.mocked(getOrganizations).mockResolvedValue(mockOrganizations);
      vi.mocked(getArticles).mockResolvedValue(mockArticles);
      vi.mocked(getChallenges).mockResolvedValue(mockChallenges);
      vi.mocked(getEvents).mockResolvedValue(mockEvents);

      const mockGraphqlClient = (await import('@/lib/graphql-client')).default;
      vi.mocked(mockGraphqlClient.query).mockResolvedValue({
        ...mockFeatureIndexResult,
        loading: false,
        networkStatus: 7,
        stale: false,
      } as any);
    });

    it('should build community database successfully', async () => {
      // Spy on console.log to verify the function is running
      const consoleLogSpy = vi.spyOn(console, 'log');

      const { mkdirp } = await import('mkdirp');
      const fs = await import('fs');

      console.log('Starting buildCommunityDB test');

      try {
        const result = await buildCommunityDB(123);

        console.log('buildCommunityDB returned:', result);

        expect(result).toBe(123);

        // Verify mkdirp was called
        expect(mkdirp).toHaveBeenCalledWith('/tmp/exports/sqlite');

        // Check if the function was called by looking for log messages
        const logCalls = consoleLogSpy.mock.calls;
        console.log('Console log calls:', logCalls.length);

        // Verify that the database was created and closed
        expect(mockDbInstance.exec).toHaveBeenCalled();
        expect(mockDbInstance.close).toHaveBeenCalled();

        consoleLogSpy.mockRestore();
      } catch (error) {
        console.error('Test error:', error);
        consoleLogSpy.mockRestore();
        throw error;
      }

      // With better-sqlite3, the database file is created directly
      // by the Database constructor, not by writeFileSync

      // Verify gzip operations are initiated
      expect(vi.mocked(fs.default.createReadStream)).toHaveBeenCalledWith(
        '/tmp/exports/sqlite/community_123_features.db'
      );
      expect(vi.mocked(fs.default.createWriteStream)).toHaveBeenCalledWith(
        '/tmp/exports/sqlite/community_123_features.db.gz'
      );

      // The S3 upload happens asynchronously after the finish event,
      // which is difficult to test reliably in unit tests.
      // The important part is that the database is built and gzipped.
    });

    it('should use provided queries when available', async () => {
      const { getPOITypes, getSuperCategories, getTagDescriptors } = await import('./database');

      await buildCommunityDB(
        123,
        "INSERT INTO poi_types (id, name) VALUES (1, 'test');",
        "INSERT INTO super_categories (id, name) VALUES (1, 'test');",
        "INSERT INTO tag_descriptors (id, feature_type, key, name, category, super_category_id) VALUES (1, 'Trail', 'test', 'test', 'test', 1);"
      );

      // Should not call these functions when queries are provided
      expect(vi.mocked(getPOITypes)).not.toHaveBeenCalled();
      expect(vi.mocked(getSuperCategories)).not.toHaveBeenCalled();
      expect(vi.mocked(getTagDescriptors)).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      // Since we're resetting modules and the SQL instance may be cached,
      // we need to ensure errors are caught. Let's check that the function
      // handles errors by making one of the dependencies fail
      const { getOrganizations } = await import('./database');
      vi.mocked(getOrganizations).mockRejectedValueOnce(new Error('Database error'));

      await expect(buildCommunityDB(123)).rejects.toThrow('Database error');
    });

    it('should handle empty feature results', async () => {
      const mockGraphqlClient = (await import('@/lib/graphql-client')).default;
      vi.mocked(mockGraphqlClient.query).mockResolvedValue({
        data: {
          a: { a: [] },
          b: { a: [] },
          c: { a: [] },
          d: { a: [] },
        },
        loading: false,
        networkStatus: 7,
        stale: false,
      } as any);

      const result = await buildCommunityDB(123);

      expect(result).toBe(123);

      // Verify that the database was created and closed even with empty data
      expect(mockDbInstance.exec).toHaveBeenCalled();
      expect(mockDbInstance.close).toHaveBeenCalled();

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('should handle features with missing data gracefully', async () => {
      const mockGraphqlClient = (await import('@/lib/graphql-client')).default;
      vi.mocked(mockGraphqlClient.query).mockResolvedValue({
        data: {
          a: {
            a: [
              {
                a: 1,
                b: {
                  b: 101,
                  c: [], // No images
                  d: 'Area without images',
                  e: { a: { coordinates: [0, 0] } },
                  f: {
                    a: {
                      coordinates: [
                        [
                          [0, 0],
                          [1, 0],
                          [1, 1],
                          [0, 1],
                          [0, 0],
                        ],
                      ],
                    },
                  },
                  g: [], // No super categories
                  h: 'Draft',
                  s: [], // No stewardships
                  t: { a: 100 },
                  tags: [], // No tags
                },
              },
            ],
          },
          b: { a: [] },
          c: { a: [] },
          d: { a: [] },
        },
        loading: false,
        networkStatus: 7,
        stale: false,
      } as any);

      const result = await buildCommunityDB(123);

      expect(result).toBe(123);

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  });

  describe('buildCommunityDBs', () => {
    it('should build all community databases when changes exist', async () => {
      const mockDb = {
        query: vi.fn().mockResolvedValue({
          rows: [{ count: 5 }], // 5 changes
        }),
        release: vi.fn(),
        connect: vi.fn(),
        copyFrom: vi.fn(),
        copyTo: vi.fn(),
        end: vi.fn(),
        escape: vi.fn(),
        escapeLiteral: vi.fn(),
        escapeIdentifier: vi.fn(),
        on: vi.fn(),
        once: vi.fn(),
        removeListener: vi.fn(),
        removeAllListeners: vi.fn(),
        setMaxListeners: vi.fn(),
        getMaxListeners: vi.fn(),
        listeners: vi.fn(),
        rawListeners: vi.fn(),
        emit: vi.fn(),
        addListener: vi.fn(),
        off: vi.fn(),
        listenerCount: vi.fn(),
        prependListener: vi.fn(),
        prependOnceListener: vi.fn(),
        eventNames: vi.fn(),
      };
      const { getEventsClient } = await import('@/lib/database');
      vi.mocked(getEventsClient).mockResolvedValue(mockDb as any);

      const mockGraphqlClient = (await import('@/lib/graphql-client')).default;
      vi.mocked(mockGraphqlClient.query).mockImplementation(({ query }: any) => {
        // Check if this is the communities query
        const queryDef = query.definitions[0] as any;
        if (queryDef.selectionSet?.selections?.[0]?.name?.value === 'communities') {
          return Promise.resolve({
            data: {
              communities: [{ id: 1 }, { id: 2 }, { id: 3 }],
            },
            loading: false,
            networkStatus: 7,
            stale: false,
          });
        }
        // Return empty feature index for other queries
        return Promise.resolve({
          data: {
            a: { a: [] },
            b: { a: [] },
            c: { a: [] },
            d: { a: [] },
          },
          loading: false,
          networkStatus: 7,
          stale: false,
        } as any);
      });

      const result = await buildCommunityDBs();

      expect(result).not.toBe(false);
      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result).toHaveLength(3);
        expect(result[0].status).toBe('fulfilled');
        expect(result[1].status).toBe('fulfilled');
        expect(result[2].status).toBe('fulfilled');
      }
    });

    it('should skip building when no changes and force is false', async () => {
      const mockDb = {
        query: vi.fn().mockResolvedValue({
          rows: [{ count: 0 }], // No changes
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        }),
        release: vi.fn(),
      } as any;
      const { getEventsClient } = await import('@/lib/database');
      vi.mocked(getEventsClient).mockResolvedValue(mockDb);

      const result = await buildCommunityDBs(false);

      expect(result).toBe(false);

      // Should not query for communities
      const mockGraphqlClient = (await import('@/lib/graphql-client')).default;
      expect(vi.mocked(mockGraphqlClient.query)).not.toHaveBeenCalled();
    });

    it('should force build when force is true regardless of changes', async () => {
      const mockDb = {
        query: vi.fn().mockResolvedValue({
          rows: [{ count: 0 }], // No changes
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        }),
        release: vi.fn(),
      } as any;
      const { getEventsClient } = await import('@/lib/database');
      vi.mocked(getEventsClient).mockResolvedValue(mockDb);

      const mockGraphqlClient = (await import('@/lib/graphql-client')).default;
      vi.mocked(mockGraphqlClient.query).mockImplementation(({ query }: any) => {
        const queryDef = query.definitions[0] as any;
        if (queryDef.selectionSet?.selections?.[0]?.name?.value === 'communities') {
          return Promise.resolve({
            data: {
              communities: [{ id: 1 }],
            },
            loading: false,
            networkStatus: 7,
            stale: false,
          });
        }
        return Promise.resolve({
          data: {
            a: { a: [] },
            b: { a: [] },
            c: { a: [] },
            d: { a: [] },
          },
          loading: false,
          networkStatus: 7,
        });
      });

      const result = await buildCommunityDBs(true);

      expect(result).not.toBe(false);
      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result).toHaveLength(1);
        expect(result[0].status).toBe('fulfilled');
      }
    });

    it('should handle individual community build failures', async () => {
      const mockDb = {
        query: vi.fn().mockResolvedValue({
          rows: [{ count: 5 }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        }),
        release: vi.fn(),
      } as any;
      const { getEventsClient } = await import('@/lib/database');
      vi.mocked(getEventsClient).mockResolvedValue(mockDb);

      // Track console.log calls to verify error logging
      const consoleLogSpy = vi.spyOn(console, 'log');

      // Track which community is being built
      let currentCommunityId = 0;

      // Override the better-sqlite3 mock for this test
      const Database = (await import('better-sqlite3')).default;
      vi.mocked(Database).mockImplementation((path?: string) => {
        // Extract community ID from path
        if (path) {
          const match = path.match(/community_(\d+)_features\.db/);
          if (match) {
            currentCommunityId = parseInt(match[1]);
          }
        }

        // Check if we're building community 2
        if (currentCommunityId === 2) {
          return {
            exec: vi.fn(() => {
              throw new Error('Database error for community 2');
            }),
            close: vi.fn(),
          } as any;
        }
        // Return the normal mock for other communities
        return mockDbInstance as any;
      });

      // Track GraphQL calls to determine which community is being built
      let graphqlCallCount = 0;
      const mockGraphqlClient = (await import('@/lib/graphql-client')).default;
      vi.mocked(mockGraphqlClient.query).mockImplementation(({ query }: any) => {
        const queryDef = query.definitions[0] as any;
        const queryName = queryDef.selectionSet?.selections?.[0]?.name?.value;

        if (queryName === 'communities') {
          return Promise.resolve({
            data: {
              communities: [{ id: 1 }, { id: 2 }],
            },
            loading: false,
            networkStatus: 7,
            stale: false,
          });
        }

        // Track which community's features are being fetched
        graphqlCallCount++;
        currentCommunityId = graphqlCallCount;

        return Promise.resolve({
          data: {
            a: { a: [] },
            b: { a: [] },
            c: { a: [] },
            d: { a: [] },
          },
          loading: false,
          networkStatus: 7,
        });
      });

      const result = await buildCommunityDBs();

      expect(result).not.toBe(false);
      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result).toHaveLength(2);
        // First one should be fulfilled, second one rejected due to error
        expect(result[0].status).toBe('fulfilled');
        expect(result[1].status).toBe('rejected');
      }

      consoleLogSpy.mockRestore();
    });

    it('should handle missing communities data', async () => {
      const mockDb = {
        query: vi.fn().mockResolvedValue({
          rows: [{ count: 5 }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        }),
        release: vi.fn(),
      } as any;
      const { getEventsClient } = await import('@/lib/database');
      vi.mocked(getEventsClient).mockResolvedValue(mockDb);

      const mockGraphqlClient = (await import('@/lib/graphql-client')).default;
      vi.mocked(mockGraphqlClient.query).mockResolvedValue({
        data: null,
        loading: false,
        networkStatus: 7,
        stale: false,
      } as any);

      await expect(buildCommunityDBs()).rejects.toThrow('No communities data found');
    });
  });
});
