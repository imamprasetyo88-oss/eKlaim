const CLASS = {
  red: "idss-traffic-red",
  orange: "idss-traffic-orange",
  yellow: "idss-traffic-yellow",
  green: "idss-traffic-green",
};
export default function TrafficDot({ light = "green" }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${CLASS[light] || CLASS.green}`} />;
}
