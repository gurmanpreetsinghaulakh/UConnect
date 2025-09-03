const Post = require('../models/Post');

// Delete a user’s footprint: their posts, their comments on others, and remove their likes from others.
async function deleteUserCascade(userId) {
  // 1) Delete all posts by user
  await Post.deleteMany({ userId });

  // 2) Remove user's comments from others' posts
  await Post.updateMany(
    { "comments.userId": userId },
    { $pull: { comments: { userId } } }
  );

  // 3) Remove user's likes from others' posts
  await Post.updateMany(
    { likes: userId },
    { $pull: { likes: userId } }
  );
}

module.exports = { deleteUserCascade };
