// Internal prototype tools are available only to the project owner. Customers use the portal action.
const requireOwner = async (rl, projectId, user) => {
  if (!user || !user.userId) throw new Error("Couldn't tell who you are.");
  const project = await rl.project(projectId);
  if (!project.owner || String(project.owner.userId) !== String(user.userId)) {
    throw new Error("Only the project owner can use this view. Customers can use the sign-off portal.");
  }
  return project;
};
module.exports = { requireOwner };
