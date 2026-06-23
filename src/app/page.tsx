import PickExperienceClient from "../components/PickExperienceClient";
import { STANDARD_PICK_EXPERIENCE } from "../data/pickExperiences";

export default function Home() {
  return <PickExperienceClient experience={STANDARD_PICK_EXPERIENCE} />;
}
