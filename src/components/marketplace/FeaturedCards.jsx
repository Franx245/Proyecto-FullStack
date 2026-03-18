import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchFeaturedCards } from "@/api/store";
import CardItem from "./CardItem";
import CardSkeleton from "./CardSkeleton";

/**
 * @typedef {{ version_id: string | number }} FeaturedCard
 */

export default function FeaturedCards({
  title = "Cartas destacadas",
  queryKey = ["featured-cards"],
  queryFn = () => fetchFeaturedCards(5),
  showHeader = true,
}) {
  const queryResult = useQuery({
    queryKey,
    staleTime: 1000 * 60 * 10,
    queryFn,
  });

  const { data: cards = [], isLoading } = /** @type {{ data: FeaturedCard[] | undefined, isLoading: boolean }} */ (queryResult);

  if (!isLoading && cards.length === 0) return null;

  return (
    <section className="max-w-[1400px] mx-auto px-4 py-12">
      {showHeader ? (
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-bold">
            {title}
          </h2>

          <Link to="/singles" className="text-sm text-primary hover:underline">
            Ver todo →
          </Link>
        </div>
      ) : null}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)
          : cards.map((card) => (
              <CardItem key={card.version_id} card={card} />
            ))}
      </div>
    </section>
  );
}