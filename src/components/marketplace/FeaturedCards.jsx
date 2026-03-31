import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchFeaturedCards } from "@/api/store";
import CardItem from "./CardItem";
import CardSkeleton from "./CardSkeleton";

/**
 * @typedef {{ version_id: string | number }} FeaturedCard
 */

/** @returns {FeaturedCard[] | undefined} */
function getFeaturedBootstrap() {
  const cards = typeof window !== "undefined" ? /** @type {*} */ (window).__DUELVAULT_FEATURED_BOOTSTRAP__ : undefined;
  return Array.isArray(cards) && cards.length > 0 ? cards : undefined;
}

export default function FeaturedCards({
  title = "Cartas destacadas",
  queryKey = ["featured-cards"],
  queryFn = () => fetchFeaturedCards(5),
  showHeader = true,
}) {
  const bootstrapCards = queryKey[0] === "featured-cards" ? getFeaturedBootstrap() : undefined;

  const queryResult = useQuery({
    queryKey,
    staleTime: 1000 * 60 * 2,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 25_000,
    refetchIntervalInBackground: false,
    queryFn,
    ...(bootstrapCards ? { initialData: bootstrapCards } : {}),
  });

  const { data: cards = [], isLoading, isFetching } = /** @type {{ data: FeaturedCard[] | undefined, isLoading: boolean, isFetching: boolean }} */ (queryResult);
  const isBackgroundRefresh = isFetching && !isLoading && cards.length > 0;

  if (!isLoading && cards.length === 0) return null;

  return (
    <section className="max-w-[1400px] mx-auto px-4 py-12">
      {showHeader ? (
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-bold">
            {title}
            {isBackgroundRefresh ? <span className="ml-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 align-middle" /> : null}
          </h2>

          <Link to="/singles" className="text-sm text-primary hover:underline">
            Ver todo →
          </Link>
        </div>
      ) : null}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)
          : cards.map((card, index) => (
              <CardItem key={card.version_id} card={card} priorityImage={index === 0} />
            ))}
      </div>
    </section>
  );
}