<script lang="ts">
    import type { BigNumber } from "@ethersproject/bignumber"
    import { onMount } from "svelte"

    export let party

    let value: BigNumber
    let total: BigNumber

    let bar: HTMLDivElement

    let eth: EthHelper

    $: {
        if (bar != undefined && value != undefined && total != undefined) {
            // console.log("v: " + eth.utils.formatEther(value) + " t: " + total.toString() + " w: " + value.div(total))
            // console.log("TOTAL" + total.toString())
            // console.log("WOAH " + value.div(total))
            bar.style.width = fraction(value, total) + "%"
        }
    }

    $: console.log("VALUE: " + value?.toString())

    onMount(async () => {
        const module = await import("$lib/api/eth")
        eth = module.EthHelper

        load()

        console.log(value)
        console.log(total)
    })

    async function load() {
        value = await eth.fetchContributions(party._id)
        total = await eth.fetchTarget(party._id)
    }

    function fraction(num: BigNumber, den: BigNumber) {
        let digitsDen = den.toString().length
        let digitsNum = num.toString().length
        let digitsDiff = digitsDen - digitsNum

        if (digitsDiff > 4) {
            return 0
        } else {
            let d = Number.parseInt(den.toString().substring(0, 4).padEnd(4, "0"))
            let n = Number.parseInt(num.toString().substring(0, 4).padEnd(4, "0")) / 10 ** (digitsDen - digitsNum)

            return (n / d) * 100
        }
    }
</script>

<div class="progress-bar">
    <div class="progress-bar-fill" bind:this={bar} />
</div>

{#if value && total}
    <p>{eth.utils.formatEther(value)} / {eth.utils.formatEther(total)} ETH</p>
{/if}

<style lang="scss">
    .progress-bar {
        height: 16px;
        width: 100%;
        background: #dcdcdc;
        border-radius: 8px;
        overflow: hidden;

        .progress-bar-fill {
            transition: 0.5s all;

            height: 100%;
            width: 0%;
            background: #7148c8;
        }

        p {
            // position: relative;
            // top: 0px;
            // left: 16px;

            font-family: "Montserrat", sans-serif;
            font-size: 14px;
            font-weight: 600;
        }
    }
</style>
