const Apify = require('apify');
const moment = require('moment-timezone');
const _ = require('lodash');

const { log } = Apify.utils;
log.setLevel(log.LEVELS.WARNING);

const LATEST ='LATEST';

Apify.main(async () => {
    const sourceUrl = 'https://www.bag.admin.ch/bag/en/home/krankheiten/ausbrueche-epidemien-pandemien/aktuelle-ausbrueche-epidemien/novel-cov/situation-schweiz-und-international.html';
    const kvStore = await Apify.openKeyValueStore("COVID-19-SWITZERLAND");
    const dataset = await Apify.openDataset("COVID-19-SWITZERLAND-HISTORY");

    const requestList = new Apify.RequestList({
        sources: [
            { url: sourceUrl },
        ],
    });
    await requestList.initialize();

    const crawler = new Apify.CheerioCrawler({
        requestList,
        maxRequestRetries: 1,
        handlePageTimeoutSecs: 60,

        handlePageFunction: async ({ request, html, $ }) => {
            console.log(`Processing ${request.url}...`);

            const data = {
                sourceUrl,
                lastUpdatedAtApify: moment().utc().second(0).millisecond(0).toISOString(),
                readMe: "https://apify.com/dtrungtin/covid-switzerland",
            };

            const confirmedDateText = $('#content .row .main-content > div:nth-child(5) p:nth-child(3)').text();
            const matchUpadatedAt = confirmedDateText.match(/(\d+).(\d+).(\d+), (\d+).(\d+) ([apm]+)/);

            if (matchUpadatedAt && matchUpadatedAt.length > 5) {
                const dateTimeStr = `${matchUpadatedAt[3]}.${matchUpadatedAt[2]}.${matchUpadatedAt[1]} ${matchUpadatedAt[4]}:${matchUpadatedAt[5]} ${matchUpadatedAt[6]}`;
                const dateTime = moment.tz(dateTimeStr, "YYYY.MM.DD h:mm a", 'Europe/Zurich');
               
                data.lastUpdatedAtSource = dateTime.toISOString();
            } else {
                throw new Error('lastUpdatedAtSource not found');
            }

            const numberOfCases = $('#content .row .main-content > div:nth-child(5) p:nth-child(4)').text();
            const [tested, confirmed] = numberOfCases.match(/(\d+)/g);
            data.testedCases = tested;
            data.confirmedCases = confirmed;

            const numberOfDied = $('#content .row .main-content > div:nth-child(5) p:nth-child(6)').text();
            const [died] = numberOfDied.match(/(\d+)/g);
            data.numberOfDeaths = died;

            // Compare and save to history
            const latest = await kvStore.getValue(LATEST) || {};
            if (!_.isEqual(_.omit(data, 'lastUpdatedAtApify'), _.omit(latest, 'lastUpdatedAtApify'))) {
                await dataset.pushData(data);
            }

            await kvStore.setValue(LATEST, data);
            await Apify.pushData(data);
        },

        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed twice.`);
        },
    });

    await crawler.run();

    console.log('Crawler finished.');
});
