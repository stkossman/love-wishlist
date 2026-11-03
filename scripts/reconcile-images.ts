const args = process.argv.slice(2);
if (!args.length || (args[0] !== '--dry-run' && args[0] !== '--apply')) {
  console.log(
    'Usage: bun scripts/reconcile-images.ts --dry-run\n       bun scripts/reconcile-images.ts --apply --public-id wishlist/ID'
  );
} else if (args[0] === '--dry-run' && args.length === 1) {
  const { WishlistMediaRepository } =
    await import('../src/modules/wishlist/wishlist-media.repository');
  console.log(JSON.stringify(await WishlistMediaRepository.inspectOrphans(), null, 2));
} else if (args[0] === '--apply' && args.length === 3 && args[1] === '--public-id') {
  const { WishlistMediaService } = await import('../src/modules/wishlist/wishlist-media.service');
  const result = await WishlistMediaService.cleanup(args[2], true);
  console.log(JSON.stringify({ publicId: args[2], result }));
  if (result === 'failed') process.exitCode = 1;
} else {
  console.error('Invalid arguments. Run without arguments for usage.');
  process.exitCode = 1;
}
export {};
