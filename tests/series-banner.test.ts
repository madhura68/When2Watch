import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SeriesBanner } from "@/app/series-banner";

const banner = "https://static.tvmaze.com/uploads/images/medium_leaderboard/595/1489665.jpg";
const background = "https://static.tvmaze.com/uploads/images/original_untouched/631/1577977.jpg";
const poster = "https://static.tvmaze.com/uploads/images/medium_portrait/637/1592971.jpg";

it.each([
  { bannerUrl: banner, backgroundUrl: background, poster, expected: banner },
  { bannerUrl: null, backgroundUrl: background, poster, expected: background },
  { bannerUrl: null, backgroundUrl: null, poster, expected: poster },
  { bannerUrl: null, backgroundUrl: null, poster: null, expected: "/images/when2watch-banner.svg" },
])("renders the first available artwork: $expected", ({ expected, ...props }) => {
  const html = renderToStaticMarkup(createElement(SeriesBanner, props));
  expect(html).toContain(`src="${expected}"`);
  expect(html.match(/<img\b/g)).toHaveLength(1);
  expect(html).toContain('alt=""');
});
