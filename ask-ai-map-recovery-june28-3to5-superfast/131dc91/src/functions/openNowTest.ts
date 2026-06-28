import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import {
  getManilaNow,
  getOpenNowStatus,
  getOpenNowStatusForLocalTime,
  isValidTime,
  isValidWeekday,
  OPEN_NOW_TIMEZONE,
  PlaceHours,
  Weekday,
} from "../utils/openNow";

const SAMPLE_HOURS: PlaceHours = {
  monday: [{ open: "09:00", close: "22:00" }],
  tuesday: [{ open: "09:00", close: "22:00" }],
  wednesday: [{ open: "09:00", close: "22:00" }],
  thursday: [{ open: "09:00", close: "22:00" }],
  friday: [{ open: "18:00", close: "02:00" }],
  saturday: [{ open: "10:00", close: "23:00" }],
  sunday: [{ open: "10:00", close: "21:00" }],
};

function getQueryParam(request: HttpRequest, key: string): string | undefined {
  const value = request.query.get(key);
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function isTrueParam(value: string | undefined): boolean {
  return value?.toLowerCase() === "true";
}

export async function openNowTest(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const rawDay = getQueryParam(request, "day");
  const time = getQueryParam(request, "time");
  const unknownHours = isTrueParam(getQueryParam(request, "unknownHours"));

  try {
    if (unknownHours) {
      return {
        status: 200,
        jsonBody: {
          success: true,
          timezone: OPEN_NOW_TIMEZONE,
          openNow: getOpenNowStatus(null),
        },
      };
    }

    if (time && !isValidTime(time)) {
      return {
        status: 400,
        jsonBody: {
          success: false,
          message: "Invalid time format. Use HH:mm.",
        },
      };
    }

    if (rawDay && !isValidWeekday(rawDay)) {
      return {
        status: 400,
        jsonBody: {
          success: false,
          message:
            "Invalid day. Use monday, tuesday, wednesday, thursday, friday, saturday, or sunday.",
        },
      };
    }

    if ((rawDay && !time) || (!rawDay && time)) {
      return {
        status: 400,
        jsonBody: {
          success: false,
          message: "Both day and time are required when testing a custom time.",
        },
      };
    }

    const manilaNow = getManilaNow();
    const day = rawDay ? (rawDay.toLowerCase() as Weekday) : manilaNow.day;
    const resolvedTime = time ?? manilaNow.time;
    const openNow = rawDay
      ? getOpenNowStatusForLocalTime(SAMPLE_HOURS, day, resolvedTime)
      : getOpenNowStatus(SAMPLE_HOURS);

    return {
      status: 200,
      jsonBody: {
        success: true,
        timezone: OPEN_NOW_TIMEZONE,
        day,
        time: resolvedTime,
        openNow,
      },
    };
  } catch (error) {
    context.error("Open-now test failed.", error);

    return {
      status: 500,
      jsonBody: {
        success: false,
        message: "Internal server error.",
      },
    };
  }
}

app.http("openNowTest", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "places/open-now-test",
  handler: openNowTest,
});
